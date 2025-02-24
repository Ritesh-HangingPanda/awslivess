require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { Readable } = require("stream");
const { STSClient, GetCallerIdentityCommand } = require("@aws-sdk/client-sts");
const { RekognitionClient, ListCollectionsCommand } = require("@aws-sdk/client-rekognition");
const { RekognitionStreamingClient, StartFaceLivenessSessionCommand } = require("@aws-sdk/client-rekognitionstreaming");

const app = express();

// 🌐 Enable CORS with credentials
app.use(
      cors({
            origin: process.env.CLIENT_URL || "*",
            credentials: true,
      })
);

// 📝 Middleware
app.use(bodyParser.json({ limit: "50mb" }));

const credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

// 🛡️ AWS Clients
const stsClient = new STSClient({
      region: process.env.AWS_REGION,
      credentials,
});

const rekognitionClient = new RekognitionClient({
      region: process.env.AWS_REGION,
      credentials,
});

const rekognitionStreamingClient = new RekognitionStreamingClient({
      region: process.env.AWS_REGION,
      credentials,
});

// 🚀 API Endpoint for AWS Connectivity Check
app.get("/aws-check", async (req, res) => {
      try {
            const stsResponse = await stsClient.send(new GetCallerIdentityCommand({}));
            const rekognitionResponse = await rekognitionClient.send(new ListCollectionsCommand({}));
            res.status(200).json({
                  message: "AWS Connectivity Successful",
                  sts: stsResponse,
                  rekognition: rekognitionResponse,
            });
      } catch (error) {
            res.status(500).json({
                  message: "AWS Connectivity Error",
                  error: error.message,
            });
      }
});

// 🎥 Start Liveness Streaming Endpoint
app.post("/startStreaming", async (req, res) => {
      try {
            const {
                  SessionId,
                  videoChunks,
                  VideoWidth,
                  VideoHeight,
                  ChallengeVersions,
                  ChallengeId,
                  InitialFace,
                  TargetFace,
                  ColorDisplayed,
            } = req.body;

            if (!Array.isArray(videoChunks)) {
                  return res.status(400).json({ message: "Invalid videoChunks format" });
            }

            const chunkSize = 64 * 1024;
            let timestamp = Date.now();

            const readableStream = Readable.from((async function* () {
                  // 1️⃣ Send ClientSessionInformationEvent first
                  yield JSON.stringify({
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
                  });

                  // 2️⃣ Stream VideoEvent chunks
                  for (const base64Chunk of videoChunks) {
                        const bufferChunk = Buffer.from(base64Chunk, "base64");
                        for (let i = 0; i < bufferChunk.length; i += chunkSize) {
                              yield JSON.stringify({
                                    VideoEvent: {
                                          VideoChunk: new Uint8Array(bufferChunk.subarray(i, i + chunkSize)),
                                          TimestampMillis: timestamp,
                                    },
                              });
                              timestamp += 50;
                        }
                  }
            })());

            const params = {
                  SessionId,
                  VideoWidth,
                  VideoHeight,
                  ChallengeVersions,
                  LivenessRequestStream: readableStream,
            };

            const command = new StartFaceLivenessSessionCommand(params);
            const response = await rekognitionStreamingClient.send(command);

            res.status(200).json({
                  message: "Liveness streaming started successfully",
                  result: response,
            });
      } catch (error) {
            console.error("🔴 AWS Raw Error:", JSON.stringify(error?.$response || error, null, 2));
            res.status(500).json({
                  message: "AWS Error",
                  error: error.message,
                  awsRaw: error?.$response ? error.$response.body.toString() : "No raw response",
            });
      }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));