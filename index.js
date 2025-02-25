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

const { Readable } = require("readable-stream");

const rekognitionClient = new RekognitionClient({ region: "us-east-1" });
const rekognitionStreamingClient = new RekognitionStreamingClient({
      region: "us-east-1",
      endpoint: "https://streaming-rekognition.us-east-1.amazonaws.com",
});

exports.handler = async (event) => {
      try {
            const body = JSON.parse(event.body || "{}");

            switch (body.action) {
                  case "createSession":
                        return await createLivenessSession();
                  case "startStreaming":
                        const {
                              SessionId,
                              videoChunks,
                              VideoWidth,
                              VideoHeight,
                              ChallengeId,
                              InitialFace,
                              TargetFace,
                              ColorDisplayed,
                        } = body;
                        if (
                              !SessionId
                              || !Array.isArray(videoChunks)
                              || !VideoWidth
                              || !VideoHeight
                              || !ChallengeId
                              || !InitialFace
                              || !TargetFace
                              || !ColorDisplayed
                        ) {
                              return invalidRequestResponse();
                        } else {
                              return await startLivenessStreaming(
                                    SessionId,
                                    videoChunks,
                                    VideoWidth,
                                    VideoHeight,
                                    ChallengeId,
                                    InitialFace,
                                    TargetFace,
                                    ColorDisplayed
                              );
                        }
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
            return errorResponse("Failed to create liveness session", error);
      }
};

// Start Liveness Streaming with chunked data
const startLivenessStreaming = async (
      SessionId,
      videoChunks,
      VideoWidth,
      VideoHeight,
      ChallengeId,
      InitialFace,
      TargetFace,
      ColorDisplayed
) => {
      try {
            const chunkSize = 64 * 1024;
            let timestamp = Date.now();

            const readableStream = Readable.from(
                  (async function* () {
                        yield {
                              ClientSessionInformationEvent: {
                                    Challenge: {
                                          FaceMovementAndLightChallenge: {
                                                ChallengeId,
                                                VideoStartTimestamp: timestamp,
                                                VideoEndTimestamp: timestamp + videoChunks.length * 50,
                                                InitialFace,
                                                TargetFace,
                                                ColorDisplayed,
                                          },
                                    },
                              },
                        };

                        for (const base64Chunk of videoChunks) {
                              const bufferChunk = Buffer.from(base64Chunk, "base64");
                              for (let i = 0; i < bufferChunk.length; i += chunkSize) {
                                    const chunk = bufferChunk.subarray(i, i + chunkSize);
                                    yield {
                                          VideoEvent: {
                                                VideoChunk: chunk,
                                                TimestampMillis: timestamp,
                                          },
                                    };
                                    timestamp += 50;
                              }
                        }
                  })()
            );

            const params = {
                  SessionId: SessionId.toString(),
                  VideoWidth: VideoWidth.toString(),
                  VideoHeight: VideoHeight.toString(),
                  ChallengeVersions: "1.0",
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
            return errorResponse("Failed to start liveness streaming", error);
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
            return errorResponse("Failed to fetch liveness results", error);
      }
};
