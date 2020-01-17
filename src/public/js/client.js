'use strict';
const socket = io.connect();

// Stream Audio
let bufferSize = 2048,
	AudioContext,
	context,
	processor,
	input,
	globalStream;

let resultText = document.getElementById('ResultText'),
	streamStreaming = false;

// record speech
function initRecording() {
	socket.emit('startGoogleCloudStream', '');
	streamStreaming = true;
	AudioContext = window.AudioContext || window.webkitAudioContext;
	context = new AudioContext({
		latencyHint: 'interactive',
	});
	processor = context.createScriptProcessor(bufferSize, 1, 1);
	processor.connect(context.destination);
	context.resume();

	var handleSuccess = function (stream) {
		globalStream = stream;
		input = context.createMediaStreamSource(stream);
		input.connect(processor);

		processor.onaudioprocess = function (e) {
			microphoneProcess(e);
		};
	};

	navigator.mediaDevices.getUserMedia({audio: true, video: false})
		.then(handleSuccess);

}

function microphoneProcess(e) {
	var buffer = e.inputBuffer.getChannelData(0);
	var downSampledBuffer = downsampleBuffer(buffer, 44100, 16000);
	socket.emit('binaryData', downSampledBuffer);
}




// ui
var startButton = document.getElementById("startRecButton");
startButton.addEventListener("click", startRecording);

var endButton = document.getElementById("stopRecButton");
endButton.addEventListener("click", stopRecording);
endButton.disabled = true;

var recordingStatus = document.getElementById("recordingStatus");

var lightingMode = document.getElementById("lightingMode");
lightingMode.addEventListener("click", changeLightingMode);

var clipboard = document.getElementById("copyToClipboard");
clipboard.addEventListener("click", copyToClipboard);

function copyToClipboard() {
    let textArea = document.getElementById("resultText");
    textArea.select();
    document.execCommand("copy");
}

function changeLightingMode() {
    document.body.classList.toggle("dark-mode");
    document.getElementById("startRecButton").classList.toggle("dark-mode");
	document.getElementById("stopRecButton").classList.toggle("dark-mode");
	document.getElementById("copyToClipboard").classList.toggle("dark-mode");
	document.getElementsByClassName("resultText")[0].classList.toggle("dark-mode");
}

function startRecording() {
	startButton.disabled = true;
	endButton.disabled = false;
	recordingStatus.style.visibility = "visible";
	initRecording();
}

function stopRecording() {
	// waited for FinalWord
	startButton.disabled = false;
	endButton.disabled = true;
	recordingStatus.style.visibility = "hidden";
	streamStreaming = false;

	socket.emit('endGoogleCloudStream', '', function(text){
		console.log("text: " + text);
	});

	let track = globalStream.getTracks()[0];
	track.stop();
	input.disconnect(processor);
	processor.disconnect(context.destination);
	context.close().then(function () {
		input = null;
		processor = null;
		context = null;
		AudioContext = null;
		startButton.disabled = false;
	});
}

// socket.io
socket.on('connect', function (data) {
	socket.emit('join', 'Server Connected to Client');
});

socket.on('resultText', function(data) {
	data = data.slice(1, -1);
    document.getElementById("resultText").value += data;
});

socket.on('messages', function (data) {
	console.log(data);
});

window.onbeforeunload = function () {
	if (streamStreaming) { socket.emit('endGoogleCloudStream', ''); }
};

// downsample buffer
var downsampleBuffer = function (buffer, sampleRate, outSampleRate) {
	if (outSampleRate == sampleRate) {
		return buffer;
	}
	if (outSampleRate > sampleRate) {
		throw "downsampling rate show be smaller than original sample rate";
	}
	var sampleRateRatio = sampleRate / outSampleRate;
	var newLength = Math.round(buffer.length / sampleRateRatio);
	var result = new Int16Array(newLength);
	var offsetResult = 0;
	var offsetBuffer = 0;
	while (offsetResult < result.length) {
		var nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
		var accum = 0, count = 0;
		for (var i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
			accum += buffer[i];
			count++;
		}

		result[offsetResult] = Math.min(1, accum / count) * 0x7FFF;
		offsetResult++;
		offsetBuffer = nextOffsetBuffer;
	}
	return result.buffer;
}