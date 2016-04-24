var CrosstalkCancel = function(audio_context, spkr2spkr, lstnr2spkr, head_radius){
    this.context = audio_context;
    this.S = (typeof spkr2spkr === 'undefined') ? 0.1524 : spkr2spkr/2;
    this.L = (typeof lstnr2spkr === 'undefined') ? 0.5588 : lstnr2spkr;
    this.r = (typeof head_radius === 'undefined') ? 0.1075 : head_radius;
    this.c = 343.2;
    this.input = this.context.createChannelSplitter(2);
    this.output = this.context.createChannelMerger(2);

	this.update_distances = function(){
		this.D = Math.sqrt(Math.pow(this.L, 2) + Math.pow(this.S, 2));
		this.theta = Math.atan(this.S / this.L);
		this.delta_d = this.r * (Math.PI - 2 * Math.acos(this.S / (Math.sqrt(Math.pow(this.L,2) + Math.pow(this.S,2)))));
		this.d1 = Math.sqrt(Math.pow(this.L,2) + Math.pow(this.S-this.r,2));
		this.d2 = this.d1 + this.delta_d;
		this.attenuation = this.d1 / this.d2;
		this.delay_time = this.delta_d / this.c;
		console.log('updated distances');
	}
	this.update_distances();

    this.update_cancellers = function(){
		var channels = [this.left_channel_cancels, this.right_channel_cancels];
		for(var c=0; c<channels.length; c++){
			var channel = channels[c];
			for(var i=0; i<channel.length; i++){
				var cancel = channel[i];
				cancel.delay.delayTime.value = this.delay_time;
				cancel.inverter.gain.value = -1 * this.attenuation;
			} 
		}
    };

    this.create_cancellers = function(input, output, channel){
        // channel parameter either -1, or 1 representing left or right channel
        var cancels = [];
        for (var i = 0; i < 30; i++){
            var delay = this.context.createDelay(10);
            delay.delayTime.value = this.delay_time;
            var inverter = this.context.createGain();
            inverter.gain.value = -1 * this.attenuation;
            var head_shadow = this.context.createBiquadFilter();
            head_shadow.type = 'highshelf';
            head_shadow.frequency = 2000;
            head_shadow.gain.value = -2.5;

            delay.connect(head_shadow);
            head_shadow.connect(inverter);
            if (channel == -1){
                input.connect(delay);
                inverter.connect(output, 0, 1);
            }else{
                input.connect(delay);
                inverter.connect(output, 0, 0);
            }
            input = inverter;
            channel = -1 * channel;
            var cancel = {
                delay: delay,
                inverter: inverter,
                head_shadow: head_shadow,
            }
            cancels.push(cancel);
        }
        return cancels;
    }

    this.create_panners = function(input, output, channel){
        // channel parameter either -1, or 1 representing left or right channel
        var panners = [];
        for (var i = 0; i < 20; i++){
            var panner = this.context.createPanner();
            panner.panningModel = 'HRTF';
            panner.refDistance = this.D - this.delta_d;
            panner.setOrientation(0, 0, 0);
            panner.setPosition(channel*this.S, this.L, 0);
            var splitter = this.context.createChannelSplitter(2);
            var inverter = this.context.createGain();
            inverter.gain.value = -1;
            panner.connect(inverter);
            inverter.connect(splitter);
            if (channel == -1){
                input.connect(panner, 0);
                splitter.connect(output, 1, 1);
            }else{
                input.connect(panner, 1);
                splitter.connect(output, 0, 0);
            }
            panners.push(panner);
            input = splitter;
            channel = -1 * channel;
        }
        return panners;
    }
    this.left_channel_cancels = this.create_cancellers(this.input, this.output, -1);
    this.right_channel_cancels = this.create_cancellers(this.input, this.output, 1);

    this.connect = function(source, destination){
        source.connect(this.input);
        this.output.connect(destination);
    };

    this.disconnect = function(source, destination){
        this.output.disconnect();
    };
}

CrosstalkCancel.prototype = {
    set spkr2spkr(value) {
        this.S = value/2;
		this.update_distances();
		this.update_cancellers();
    },
    set lstnr2spkr(value) {
        this.L = value;
		this.update_distances();
		this.update_cancellers();
    },
    set head_diameter(value) {
        this.r = value/2;
		this.update_distances();
		this.update_cancellers();
    }
};
