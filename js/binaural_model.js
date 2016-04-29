var BinauralModel = function(audio_context, head_radius, azimuth, elevation, distance){
    this.context = audio_context;
    this.radius = (typeof head_radius === 'undefined') ? 0.1075 : head_radius;
    this.azimuth = (typeof azimuth === 'undefined') ? 0.0 : azimuth;
    this.elevation = (typeof elevation === 'undefined') ? 0.0 : elevation;
    this.d = (typeof distance === 'undefined') ? 1.0 : distance;
    this.c = 343.2;
    this.ref_distance = 1;
    this.input = this.context.createGain();
    this.output = this.context.createChannelMerger(2);

	this.update_distances = function(){
        var d = this.d;
        var r = this.radius;
        var theta = this.azimuth % Math.PI;
        var d1 = Math.sqrt(Math.pow(d,2) + Math.pow(r,2) - 2*d*r*Math.sin(Math.abs(theta)));
        var inc_angle = Math.acos((Math.pow(d,2) + Math.pow(r,2) - Math.pow(d1,2)) / (2*d*r));
        var tangent = Math.sqrt(Math.pow(d,2) - Math.pow(r,2));
        var d2 = tangent + r * (Math.PI - inc_angle - Math.acos(r / d));
        if(tangent < d1){
            d1 = tangent + r*(inc_angle - Math.acos(r / d));
        }
        var delta_d = Math.abs(d2 - d1);
        if(-Math.PI < this.azimuth && this.azimuth < 0 || Math.PI < this.azimuth && this.azimuth < 2*Math.PI){
            delta_d = -delta_d;
            this.d_left = d1;
            this.d_right = d2;
        }else{
            this.d_left = d2;
            this.d_right = d1;
        }
        this.delta_d = delta_d;
        this.ITD = delta_d / this.c;
	}

    this.update_nodes = function(){
        var left = this.left_nodes;
        var right = this.right_nodes;
        if(this.ITD > 0){
            left.delay.delayTime.value = this.ITD;
            right.delay.delayTime.value = 0;
            left.head_shadow.gain.value = -30*this.delta_d;
            left.head_shadow2.gain.value = -40*this.delta_d;
            right.head_shadow.gain.value = 0;
            right.head_shadow2.gain.value = 0;
            //var b_left = this.headshadow_coefficients();
            //var b_right = [1];
        }else{
            right.delay.delayTime.value = Math.abs(this.ITD);
            left.delay.delayTime.value = 0;
            left.head_shadow.gain.value = 0;
            left.head_shadow2.gain.value = 0;
            right.head_shadow.gain.value = 30*this.delta_d;
            right.head_shadow2.gain.value = 40*this.delta_d;
            //var b_left = [1];
            //var b_right = this.headshadow_coefficients();
        }
        left.attenuation.gain.value = this.ref_distance / this.d_left;
        right.attenuation.gain.value = this.ref_distance / this.d_right;
        // Headshadow
        //var buffer = this.context.createBuffer(1, b_left.length, this.context.sampleRate);
        //var data = buffer.getChannelData(0);
        //for(var i=0; i<b_left.length; i++){
        //    data[i] = b_left[i];
        //}
        //left.head_shadow.buffer = buffer;
        //var buffer = this.context.createBuffer(1, b_right.length, this.context.sampleRate);
        //var data = buffer.getChannelData(0);
        //for(var i=0; i<b_right.length; i++){
        //    data[i] = b_right[i];
        //}
        //right.head_shadow.buffer = buffer;
    };

    this.create_nodes = function(input, output, channel){
        var delay = this.context.createDelay(10);
        var attenuation= this.context.createGain();
        var head_shadow = this.context.createBiquadFilter();
        head_shadow.type = 'highshelf';
        head_shadow.frequency.value = 400;
        head_shadow.gain.value = 0;
        var head_shadow2 = this.context.createBiquadFilter();
        head_shadow2.type = 'highshelf';
        head_shadow2.frequency.value = 2000;
        head_shadow2.gain.value = 0;
        //var head_shadow = this.context.createConvolver();
        //head_shadow.normalize = false;
        //var b = [1];
        //var buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
        //var data = buffer.getChannelData(0);
        //for(var i=0; i<b.length; i++){
        //    data[i] = b[i];
        //}
        //head_shadow.buffer = buffer;

        delay.connect(head_shadow);
        head_shadow.connect(head_shadow2);
        head_shadow2.connect(attenuation);

        input.connect(delay);
        attenuation.connect(output, 0, channel);
        var nodes = {
            delay: delay,
            attenuation: attenuation,
            head_shadow: head_shadow,
            head_shadow2: head_shadow2,
        }
        return nodes;
    }

    this.left_nodes = this.create_nodes(this.input, this.output, 0);
    this.right_nodes = this.create_nodes(this.input, this.output, 1);

    this.connect = function(source, destination){
        source.connect(this.input);
        this.output.connect(destination);
    };

    this.disconnect = function(){
        this.output.disconnect();
    };

    this.headshadow_coefficients = function(){
        b = [0.00892837,  0.77083333,  0.00892837];
        b = [1,0,0,0,1];
        return b;
    }
	this.update_distances();
    this.update_nodes();
}

BinauralModel.prototype = {
    set head_diameter(value) {
        this.radius = value / 2;
		this.update_distances();
		this.update_nodes();
    },
    set azimuth_angle(value) {
        this.azimuth = value;
		this.update_distances();
		this.update_nodes();
    },
    set elevation_angle(value) {
        this.elevation = value;
		this.update_distances();
		this.update_nodes();
    },
    set distance(value) {
        if(value < 1){
            value = 1;
        }
        this.d = value;
		this.update_distances();
		this.update_nodes();
    },
};
