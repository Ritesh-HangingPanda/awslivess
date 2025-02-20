const {
      RekognitionClient,
      CreateFaceLivenessSessionCommand,
      GetFaceLivenessSessionResultsCommand
} = require("@aws-sdk/client-rekognition");

const {
      RekognitionStreamingClient,
      StartFaceLivenessSessionCommand
} = require("@aws-sdk/client-rekognitionstreaming");

const { Readable } = require('stream');
const rekognitionClient = new RekognitionClient({ region: "us-east-1" });
const rekognitionStreamingClient = new RekognitionStreamingClient({ region: "us-east-1" });

exports.handler = async (event) => {
      const body = JSON.parse(event.body || '{}');

      if (body.action === 'createSession') {
            return await createLivenessSession();
      } else if (body.action === 'startStreaming' && body.sessionId && body.videoStream) {
            return await startLivenessStreaming(body.sessionId, body.videoStream);
      } else if (body.action === 'getResults' && body.sessionId) {
            return await getLivenessResults(body.sessionId);
      } else {
            return {
                  statusCode: 500,
                  body: JSON.stringify({ message: "Invalid request. Please provide valid action and required fields." }),
            };
      }
};

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
                        result: response
                  }),
            };
      } catch (error) {
            return {
                  statusCode: 500,
                  body: JSON.stringify({ message: "Failed to create liveness session", error: error.message }),
            };
      }
};

const startLivenessStreaming = async (sessionId, videoStreamBase64) => {
      try {
            const videoBuffer = Buffer.from(videoStreamBase64, 'base64');
            const chunkSize = 64 * 1024;

            const readableStream = new Readable({
                  async read() {
                        for (let i = 0; i < videoBuffer.length; i += chunkSize) {
                              this.push(videoBuffer.slice(i, i + chunkSize));
                              await new Promise((resolve) => setTimeout(resolve, 50));
                        }
                        this.push(null);
                  }
            });

            const params = {
                  SessionId: sessionId,
                  LivenessRequestStream: readableStream
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


// 📝 Retrieve Liveness Results
const getLivenessResults = async (sessionId) => {
      try {
            const params = { SessionId: sessionId };
            const command = new GetFaceLivenessSessionResultsCommand(params);
            const response = await rekognitionClient.send(command);

            const isLivenessConfirmed = response.Confidence >= 0.8 && response.Status === "LIVENESS_CONFIRMED";

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
