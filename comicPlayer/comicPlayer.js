/*
 * ComicPlayer takes an array of {url,begin,end}-objects as arguments, and plays them in sequence.
 * - begin and end is milliseconds into the respective audio file.
 * - begin and end is optional, and will be set to either the beginning or
 *   the end of its audio file respectively
 * - the same audio file can be used for several frames.
 * - you are not required to use the whole audio file (although it's recommended).
 * - you are not required to play an audio file sequentially (although it's recommended).
 * - if the next frame begins at the same time as the previous ends, and they are
 *   playing from the same file, then the audio will play continously.
 * - one frame can not have multiple sounds
 * 
 * example usage:
 *   var comicPlayer = new ComicPlayer([
 *  		{ url: "soundUrl1.mp3", begin: "0", end: "5000" },
 *  		{ url: "soundUrl1.mp3", begin: "5000", end: "10000" },
 *  		{ url: "soundUrl1.mp3", begin: "15000", end: "20000" },
 *  		{ url: "soundUrl2.mp3", begin: "2000", end: "8500" },
 *			{ url: "soundUrl3.mp3", begin: "1000" },
 *			{ url: "soundUrl3.mp3", end: "9000" },
 *			{ url: "soundUrl3.mp3" }
 *  	 ]);
 *
 * the player is controlled using the play and stop methods:
 *   
 *   play(from, to)
 *         if play is called while playing; will stop
 *       from: frame number to play from (frame numbers starts at 0)
 *       to: frame number to play to (frame numbers starts at 0)
 *   
 *   stop()
 *         if playing; will stop
 */
function ComicPlayer(audioFrames) {
	var that = this;
	if ( typeof ComicPlayer.players === 'undefined' ) {
		ComicPlayer.players = 0;
	}
	ComicPlayer.players++;
	
	// You can register a function here to be notified on frame changes.
	// It will contain a parameter saying which frame it changed to.
	// It will change to a non-existing frame when it's not playing.
	// For instance:
	//   myComicPlayer.onFrameChange = function(frameNumber) {
	//     /* do something with frameNumber here */
	//   }
	this.onFrameChange = null;
	
	var audio = [];
	
	// prepare audioFrames
	for (var i = 0; i < audioFrames.length; i++) {
		if (!audioFrames[i].begin || audioFrames[i].begin < 0)
			audioFrames[i].begin = -1;
		
		if (!audioFrames[i].end || audioFrames[i].end < 0)
			audioFrames[i].end = -1;
		
		if (audioFrames[i].end !== -1 && audioFrames[i].end < audioFrames[i].begin) {
			var swap = audioFrames[i].end;
			audioFrames[i].end = audioFrames[i].begin;
			audioFrames[i].begin = swap;
		}
		
		var exists = false;
		for (var j = 0; j < audio.length; j++) {
			if (audio[j].url === audioFrames[i].url) {
				audioFrames[i].audioRef = j;
				exists = true;
				break;
			}
		}
		if (!exists) {
			audioFrames[i].audioRef = audio.length;
			audio.push({
				id: "comic_"+ComicPlayer.players+"_"+audio.length,
				url: audioFrames[i].url,
				object: null
			});
		}
	}
	
	var doneLoading = false;
	var errorsLoading = false;
	function load() {
		// start loading the audio
		doneLoading = true;
		for (var i = 0; i < audio.length; i++) {
			if (!audio[i].object) {
				audio[i].object = soundManager.createSound({
					id: audio[i].id,
					url: audio[i].url,
					autoLoad: true
				});
			} else {
				switch (audio[i].object.readyState) {
				case 0:
				case 1:
					doneLoading = false;
					break;
				case 3:
					errorsLoading = true;
					break;
				}
			}
		}
		
		if (!doneLoading)
			window.setTimeout(delegate(that,load),50);
		else
			run(0); // start thread
	}
	
	var fromFrame = -1;
	var currentFrame = -1;
	var toFrame = -1;
	this.play = function(from, to, noToggle) {
		if (errorsLoading) return;
		if (!doneLoading) {
			window.setTimeout(delegate(that,function(){
				play(from,to,noToggle);
			}),100);
		}
		
		if (from > to) {
			var swap = to;
			to = from;
			from = swap;
		}
		if (from < 0) from = 0;
		if (to >= audioFrames.length) to = audioFrames.length-1;
		
		fromFrame = from;
		toFrame = to;
		
		var currentAudio = null;
		if (0 <= currentFrame && currentFrame < audioFrames.length)
			currentAudio = audio[audioFrames[currentFrame].audioRef];
		
		if (currentAudio && currentAudio.object.playState && !noToggle) {
			// We are currently playing, and noToggle is not set, so just stop playback
			soundManager.stopAll();
			currentFrame = -1;
		} else {
			// We don't seem to be playing the right audio. Play the right audio.
			soundManager.stopAll();
			currentFrame = from;
			var currentAudio = audio[audioFrames[currentFrame].audioRef];
			currentAudio.object.setPosition(audioFrames[currentFrame].begin>0?audioFrames[currentFrame].begin:1);
			soundManager.play(currentAudio.id);
		}
		if (typeof this.onFrameChange === 'function') this.onFrameChange(currentFrame);
		run(0);
	}
	this.stop = function() {
		soundManager.stopAll();
		currentFrame = -1;
	}
	
	var threadId = null;			// ID of the thread (so we can make sure there's only one of them)
	var threadTimeoutId = null;		// Same as above for setTimeouts
	var updateDelay = 100;			// Maximum delay between each time the thread() is run
	
	// Starts, or prematurely updates, the thread
	function run(delay) {
		if (threadTimeoutId) {
			return;
		}
		if (threadId) {
			window.clearInterval(threadId);
			threadId = null;
		}
		
		if (!delay) delay = updateDelay;
		if (delay > updateDelay)
			delay = updateDelay;
		threadTimeoutId = window.setTimeout(delegate(that,function(){
			threadTimeoutId = null;
			if (threadId) return;
			thread();
			threadId = window.setInterval(delegate(that,thread),updateDelay);
		}),delay);
	};
	
	// The thread that runs in the background and makes sure that the right audio plays at the right time
	function thread() {
		if (currentFrame === -1 || !(fromFrame <= currentFrame && currentFrame <= toFrame) || errorsLoading) {
			// is not playing
			window.clearInterval(threadId);
			window.clearTimeout(threadId);
			return;
		}
		
		var currentAudio = audio[audioFrames[currentFrame].audioRef]; // for convenience
		
		// is playing current audio?
		if (currentAudio.object.playState) {
			// is playing correct frame?
			if (audioFrames[currentFrame].begin <= currentAudio.object.position+200 &&
				(audioFrames[currentFrame].end >= currentAudio.object.position || audioFrames[currentFrame].end === -1)) {
					// schedule the next thread runthrough to run a littlebit before the frame is done playing
					var delay = (audioFrames[currentFrame].end>0?audioFrames[currentFrame].end:currentAudio.object.duration)
								- currentAudio.object.position;
					if (delay < 10) delay = 10; // don't go while(1); on us!
					run(delay);
			} else {
				// was playing last frame?
				if (currentFrame === toFrame) {
					soundManager.stopAll();
					currentFrame = -1;
				} else {
					// has smoothly played into next frame?
					if (audioFrames[currentFrame+1].audioRef === audioFrames[currentFrame].audioRef &&
						audioFrames[currentFrame+1].begin <= currentAudio.object.position &&
						(audioFrames[currentFrame+1].end >= currentAudio.object.position || audioFrames[currentFrame+1].end === -1)) {
						currentFrame++;
					} else {
						currentFrame++;
						soundManager.stopAll();
						currentAudio = audio[audioFrames[currentFrame].audioRef];
						currentAudio.object.setPosition(audioFrames[currentFrame].begin>0?audioFrames[currentFrame].begin:1);
						soundManager.play(currentAudio.id);
					}
				}
				if (typeof this.onFrameChange === 'function') this.onFrameChange(currentFrame);
				run(10);
			}
		} else {
			// probably done with this file, go to next and play
			if (currentFrame === toFrame) {
				soundManager.stopAll();
				currentFrame = -1;
				if (typeof this.onFrameChange === 'function') this.onFrameChange(currentFrame);
			} else {
				soundManager.stopAll();
				currentFrame++;
				currentAudio = audio[audioFrames[currentFrame].audioRef];
				currentAudio.object.setPosition(audioFrames[currentFrame].begin>0?audioFrames[currentFrame].begin:1);
				soundManager.play(currentAudio.id);
				if (typeof this.onFrameChange === 'function') this.onFrameChange(currentFrame);
				run(10);
			}
		}
	}
	
	// Used to make sure that 'this' points to the right object
	function delegate(instance, method) {
		return function() {
			return method.apply(instance, arguments);
		}
	};
	
	soundManager.onready(delegate(that,function(oStatus) {
		if (oStatus.success) {
			load();
		}
	}));
	
}