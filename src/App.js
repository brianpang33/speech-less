'use strict';

const express = require('express');
const environmentVars = require('dotenv').config();

// Google Cloud Speech Settings
const speech = require('@google-cloud/speech');
const speechClient = new speech.SpeechClient();
const fetch = require("node-fetch");
const request = {
    config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 16000,
        languageCode: 'en-US',
        profanityFilter: false,
        enableWordTimeOffsets: true,
        enableAutomaticPunctuation: true,
    },
    interimResults: false
};

const app = express();
const port = process.env.PORT || 3000;
const server = require('http').createServer(app);
const io = require('socket.io')(server);

app.use('/assets', express.static(__dirname + '/public'));
app.use('/session/assets', express.static(__dirname + '/public'));
app.set('view engine', 'ejs');

// start server
server.listen(port, "127.0.0.1", function () {
    console.log('Server started on port:' + port)
});


// routers
app.get('/', function (req, res) {
    res.render('index', {});
});

app.use('/', function (req, res, next) {
    next();
});


// socket.io
io.on('connection', function (client) {
    console.log('Client Connected to server');
    let recognizeStream = null;
    let speechToText = "";

    client.on('join', function (data) {
        client.emit('messages', 'Socket Connected to Server');
    });

    client.on('messages', function (data) {
        client.emit('broad', data);
    });

    client.on('startGoogleCloudStream', function (data) {
        startRecognitionStream(this, data);
    });

    client.on('endGoogleCloudStream', function (data, fn) {
        stopRecognitionStream(fn, data);
    });

    client.on('binaryData', function (data) {
        if (recognizeStream !== null) {
            recognizeStream.write(data);
        }
    });

    function startRecognitionStream(client, data) {
        recognizeStream = speechClient.streamingRecognize(request)
            .on('error', console.error)
            .on('data', (data) => {

                client.emit('speechData', data);
                // send result
                if (data.results[0] && data.results[0].isFinal) {
                    if (speechToText == "") {
                        speechToText = data.results[0].alternatives[0].transcript;
                    } else {
                        speechToText = speechToText + " " + data.results[0].alternatives[0].transcript;
                    }
                    stopRecognitionStream(true, speechToText);
                    startRecognitionStream(client);
                }
            });
    }

    function stopRecognitionStream(fn, data) {
        if (recognizeStream) {
            recognizeStream.end();
        }
        if (fn) {
            const fetchObj = {
                body: "text=" + data,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "X-Aylien-Textapi-Application-Id": "097ff773",
                    "X-Aylien-Textapi-Application-Key": "a5687de44d5585e08b4fd26770f2df1c"
                },
                method: "POST"
            };

            fetch("https://api.aylien.com/api/v1/concepts", fetchObj)
                .then((response) => response.json())
                .then((content) => {
                    let keyWord = null;
                    try {
                        keyWord = content["concepts"][Object.keys(content["concepts"])[0]]["surfaceForms"][0]["string"];
                    } catch (err) {
                        process.stdout.write("cannot find key word for title\n");
                    }

                    if (keyWord) {
                        fetchObj["body"] = "title=" + keyWord + "&" + fetchObj["body"];
                    } else {
                        fetchObj["body"] = "title=&" + fetchObj["body"];
                    }
                    fetchObj["body"] = "sentences_percentage=50&" + fetchObj["body"];

                    fetch("https://api.aylien.com/api/v1/summarize", fetchObj)
                        .then((response) => response.json())
                        .then((content1) => {
                            if (content1.sentences != "") {
                                client.emit('resultText', JSON.stringify(content1.sentences));
                            } else {
                                client.emit('resultText', JSON.stringify(content1.text));
                            }
                            speechToText = "";
                        });
                });
        }
        recognizeStream = null;
    }

});