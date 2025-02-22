// Lambda Function: Handle Liveness Session, Chunked Streaming, and Results

const {
      RekognitionClient,
      CreateFaceLivenessSessionCommand,
      GetFaceLivenessSessionResultsCommand,
} = require("@aws-sdk/client-rekognition");

const {
      RekognitionStreamingClient,
      StartFaceLivenessSessionCommand,
} = require("@aws-sdk/client-rekognitionstreaming");

const { Readable } = require("stream");

const rekognitionClient = new RekognitionClient({ region: "us-east-1" });
const rekognitionStreamingClient = new RekognitionStreamingClient({ region: "us-east-1" });

exports.handler = async (event) => {
      try {
            const body = JSON.parse(event.body || "{}");

            switch (body.action) {
                  case "createSession":
                        return await createLivenessSession();
                  case "startStreaming":
                        if (body.sessionId && body.videoChunks) {
                              return await startLivenessStreaming(body.sessionId, body.videoChunks);
                        }
                        break;
                  case "getResults":
                        if (body.sessionId) {
                              return await getLivenessResults(body.sessionId);
                        }
                        break;
                  default:
                        return invalidRequestResponse();
            }
            return invalidRequestResponse();
      } catch (error) {
            return errorResponse("Error processing request", error);
      }
};

const invalidRequestResponse = () => ({
      statusCode: 400,
      body: JSON.stringify({ message: "Invalid request. Provide valid action and required fields." }),
});

const errorResponse = (message, error) => ({
      statusCode: 500,
      body: JSON.stringify({ message, error: error.message }),
});

// Create Liveness Session
const createLivenessSession = async () => {
      try {
            const params = { ClientRequestToken: Date.now().toString() };
            const command = new CreateFaceLivenessSessionCommand(params);
            const response = await rekognitionClient.send(command);

            return {
                  statusCode: 200,
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                        message: "Liveness session created successfully",
                        result: response,
                  }),
            };
      } catch (error) {
            return {
                  statusCode: 500,
                  body: JSON.stringify({ message: "Failed to create liveness session", error: error.message }),
            };
      }
};

// Start Liveness Streaming with chunked data
const startLivenessStreaming = async (sessionId, videoChunksBase64) => {
      try {
            const videoBuffer = Buffer.concat(videoChunksBase64.map(chunk => Buffer.from(chunk, "base64")));
            const chunkSize = 64 * 1024;

            const readableStream = new Readable({
                  async read() {
                        for (let i = 0; i < videoBuffer.length; i += chunkSize) {
                              const chunk = videoBuffer.subarray(i, i + chunkSize);
                              this.push(chunk);
                              await new Promise((resolve) => setTimeout(resolve, 50));
                        }
                        this.push(null);
                  },
            });

            const params = {
                  SessionId: sessionId,
                  LivenessRequestStream: readableStream,
            };

            const command = new StartFaceLivenessSessionCommand(params);
            const response = await rekognitionStreamingClient.send(command);

            return {
                  statusCode: 200,
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                        message: "Liveness streaming started successfully",
                        result: response,
                  }),
            };
      } catch (error) {
            return {
                  statusCode: 500,
                  body: JSON.stringify({
                        message: "Failed to start liveness streaming",
                        error: error.message,
                  }),
            };
      }
};

// Retrieve Liveness Results
const getLivenessResults = async (sessionId) => {
      try {
            const params = { SessionId: sessionId };
            const command = new GetFaceLivenessSessionResultsCommand(params);
            const response = await rekognitionClient.send(command);

            const isLivenessConfirmed =
                  response.Confidence >= 0.8 && response.Status === "LIVENESS_CONFIRMED";

            return {
                  statusCode: 200,
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                        message: "Liveness results fetched successfully",
                        livenessConfirmed: isLivenessConfirmed,
                        confidence: response.Confidence,
                        details: response,
                  }),
            };
      } catch (error) {
            return {
                  statusCode: 500,
                  body: JSON.stringify({ message: "Failed to fetch liveness results", error: error.message }),
            };
      }
};
