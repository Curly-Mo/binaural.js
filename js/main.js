document.addEventListener("DOMContentLoaded", function(event) { 
    init_physics();
    //init_head();
	init_webaudio();
    init_settings();
});

var engine;
var head;

var audio_context;
var output;
var sources = {};
var listener;
var script_processor;
//var doppler = false;
var max_distance = 5;
var algorithm = 'HRTF';
var xtc;

function init_physics(){
    // Matter.js module aliases
    var Engine = Matter.Engine,
        World = Matter.World,
        Bodies = Matter.Bodies,
        Common = Matter.Common,
        Bodies = Matter.Bodies,
        Events = Matter.Events,
        Mouse = Matter.Mouse,
        Runner = Matter.Runner;

    // create a Matter.js engine
	var options = {
        enableSleeping: true,
        positionIterations: 10,
        velocityIterations: 10,
        timing: {
            timeScale: 1,
        },
	};
    engine = Engine.create(document.getElementById('content_div'), options);
    engine.world.gravity.x = 0;
    engine.world.gravity.y = 0;
	engine.render.options.wireframes = false;
    engine.render.options.background = '#222';
    engine.render.options.showSleeping = false;

	var width = engine.render.element.clientWidth;
	var height = engine.render.element.clientHeight;
	engine.render.canvas.width = width;
	engine.render.canvas.height = height;
    // Make thick walls so balls can't clip through them
	var wall_width = 800;
    var wall_options = {
		isStatic: true,
        friction: 0,
        frictionStatic: 0,
		frictionAir: 0,
        restitution: 1,
        slop: 0,
        density: 999,
    }
	var walls = [
    	Bodies.rectangle(width/2, height + wall_width/2, width*2, wall_width, wall_options),
		Bodies.rectangle(width/2, -wall_width/2, width*2, wall_width, wall_options),
    	Bodies.rectangle(-wall_width/2, height/2, wall_width, height*2, wall_options),
    	Bodies.rectangle(width + wall_width/2, height/2, wall_width, height*2, wall_options),
	];
	World.add(engine.world, walls);

	// add mouse
    var mouseconstraint = Matter.MouseConstraint.create(engine);
    mouseconstraint.constraint.stiffness = 1;
    mouseconstraint.constraint.render.visible = false;
    Events.on(mouseconstraint, "startdrag", function(event){
        Matter.Body.setAngularVelocity(event.body, 0);
    });
    Events.on(mouseconstraint, "mousedown", function(event){
        var min_distance = Number.POSITIVE_INFINITY;
        var closest;
        for(var key in sources){
            var ball = sources[key].ball;
            if(!ball || sources[key].source_button.style.opacity != 1){
                continue;
            }
            var d = distance(ball.position, mouseconstraint.mouse.position);
            if(d < min_distance){
                closest = ball;
                min_distance = d;
            }
        }
        Matter.Body.setPosition(closest, mouseconstraint.mouse.position);
        Matter.Body.setVelocity(closest, {x: 0, y: 0});
    });
	World.add(engine.world, mouseconstraint);


    // add head
    head = Bodies.circle(width/2, height/2, 5, {
        render: {
            sprite: {
                texture: 'img/head_small.png',
            }
        },
        collisionFilter: {
            category: 3,
            mask: 0,
        },
    });
	World.add(engine.world, head);

    // run the engine
    Engine.run(engine);
}

function create_ball(id, hue){
    var width = engine.render.element.clientWidth;
    var ball = Matter.Bodies.circle(width/2, 50, 30, {
		sides: 1,
        friction: 0,
        frictionStatic: 0,
        frictionAir: 0,
        restitution: 1,
        slop: 0,
        density: 999,
        collisionFilter: {
            category: 2,
            mask: 1,
        },
    });
    if(document.getElementById('collisions').checked){
        ball.collisionFilter.mask = 3;
    }
    ball.render.fillStyle = 'hsl(' + hue + ', 100%, 50%)';
    ball.render.strokeStyle = 'hsl(' + hue + ', 100%, 30%)';
    Matter.World.add(engine.world, ball);
    setTimeout(function(){
        set_ball_zindex();
    }, 100);
    return ball;
}

function set_ball_zindex(){
    var sortable = [];
    for(var key in sources){
        sortable.push([sources[key], sources[key].elevation])
    }
    sortable.push([{ball: head}, -0.001]);
    sortable.sort(function(a, b) {return a[1] - b[1]})
    for(var i = 0; i < sortable.length; i++){
        var ball = sortable[i][0].ball;
        if(ball === undefined){
            continue;
        }
        Matter.Composite.remove(engine.world, ball);
        Matter.Composite.add(engine.world, ball);
    }
}

function init_head(){
    var head = new Image();
    head.src = 'img/head.png';
    document.body.appendChild(head);
    head.onload = function(){
        head.style.position = 'absolute';
		head.style.width = '80px';
        head.style.left = (engine.render.canvas.offsetWidth / 2 - head.width/2) + 'px';
        head.style.top = (engine.render.canvas.offsetHeight / 2 - head.height/2) + 'px';
        head.style.pointerEvents = 'none';
    };
}

function to_polar(x, y){
    var polar = {};
    polar.radius = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
    polar.angle = Math.atan2(y, x);
    // Shift so that forward is 0
	polar.angle = polar.angle + Math.PI/2;
	if(polar.angle < 0){
        polar.angle += 2*Math.PI;
    }
    // scale distance from [0-0.5] to [0-max_distance]
    polar.radius = polar.radius * 2 * max_distance;
    return polar;
}

function to_cartesian(azimuth, elevation, radius){
    var position = {}
    elevation = Math.PI - elevation;
    position.x = radius * Math.sin(azimuth) * Math.abs(Math.cos(elevation));
    position.y = radius * Math.cos(azimuth) * Math.abs(Math.cos(elevation));
    position.z = radius * Math.sin(elevation);
    return position;
}

function init_webaudio(){
	try {
    	// Fix up for prefixing
    	window.AudioContext = window.AudioContext||window.webkitAudioContext;
    	audio_context = new AudioContext();
        output = audio_context.createGain();
        script_processor = audio_context.createScriptProcessor(256, 1, 1);
        script_processor.onaudioprocess = process_audio;
        output.connect(audio_context.destination);
        output.connect(script_processor);
        script_processor.connect(audio_context.destination);
  	}
  	catch(e) {
    	alert('Web Audio API is not supported in this browser');
  	}
	load_audio('audio/spokey_dokey.mp3');
}

function load_audio(url){
	var request = new XMLHttpRequest();
  	request.open('GET', url, true);
  	request.responseType = 'arraybuffer';
	// Decode asynchronously
  	request.onload = function() {
    	audio_context.decodeAudioData(request.response, function(buffer) {
            create_source(buffer, 'default');
    	}, function(e){console.log(e)});
  	}
  	request.send();
}

function load_buffer(buffer, id){
    try {
        sources[id].audio_source.stop(0);
    } catch (e) {
    }
    var source = sources[id].audio_source;
    if(source != null){
        source.disconnect();
    }
    source = audio_context.createBufferSource();
	source.buffer = buffer;
	source.loop = true;


    var gain = sources[id].gain;
    if(gain == null){
        gain = audio_context.createGain();
    }
    sources[id].gain = gain;

    var panner = sources[id].panner;
    if(panner == null){
        panner = audio_context.createPanner();
    }
    panner.panningModel = algorithm;
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 999;
    panner.rolloffFactor = 1;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 0;
    panner.coneOuterGain = 0;
    panner.setOrientation(0, 0, 0);
    panner.setPosition(0, 0.8, 0);
    sources[id].panner = panner;

    listener = audio_context.listener;
    listener.setOrientation(0, 1, 1, 0, -1, 0);
    listener.setPosition(0, 0, 0);

    var splitter = audio_context.createChannelSplitter(2);
    var merger = audio_context.createChannelMerger(1);
    source.connect(splitter);
    splitter.connect(merger, 0, 0);
    splitter.connect(merger, 1, 0);
    merger.connect(gain);

	gain.connect(panner);
	panner.connect(output);

    var play_button = document.getElementById('play_button');
    if(play_button.textContent == String.fromCharCode(9646, 9646)){
        source.start(0);
    }
    return source;
}

function process_audio(audioProcessingEvent) {
    if(audio_context.state !== 'running'){
        return;
    }
    var width = engine.render.element.clientWidth;
    var height = engine.render.element.clientHeight;
    for(var key in sources){
        var ball = sources[key].ball;
        if(!ball){continue;}
        var x = ball.position.x / width - 0.5;
        var y = ball.position.y / height - 0.5;
        var polar = to_polar(x, y);
        if(algorithm == 'model'){
            sources[key].physical_model.azimuth_angle = polar.angle;
            sources[key].physical_model.distance = polar.radius;
        }else{
            var position = to_cartesian(polar.angle, sources[key].elevation, polar.radius);
            sources[key].panner.setPosition(position.x, position.y, position.z);
            // this is deprecated in web audio API
            //if(doppler){
            //    sources[key].panner.setVelocity(ball.velocity.x, -ball.velocity.y, 0);
            //}
        }
    }
}

function init_settings(){
	var play_button = document.getElementById('play_button');
    play_button.onclick = function(){
        if(this.textContent == String.fromCharCode(9654)){
            this.textContent = String.fromCharCode(9646, 9646);
            if(audio_context.state === 'suspended') {
                audio_context.resume();
            }
            for(var key in sources){
                try{
                    sources[key].audio_source.start(0);
                }catch(e){
                    console.log(e);
                }
            }
        }else if(this.textContent == String.fromCharCode(9646, 9646)){
            this.textContent = String.fromCharCode(9654);
            audio_context.suspend();
        }
    };
    document.getElementById('max_distance').addEventListener('change',  function(){
        max_distance = this.value;
    });
    document.getElementById('collisions').addEventListener('change',  function(){
        var mask = 1;
        if(this.checked){
            mask = 3;
        }
        for(var key in sources){
            var source = sources[key];
            if(source.ball){
                source.ball.collisionFilter.mask = mask;
            }
        }
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="algorithm"]'), function(radio) {
        radio.addEventListener('change', function(){
            algorithm = document.querySelector('input[name="algorithm"]:checked').value;
            if(algorithm=='model'){
                document.getElementById('model_settings').style.display = 'block';
                for(var key in sources){
                        var gain = sources[key].gain;
                        var panner = sources[key].panner;
                        gain.disconnect();
                        var model = sources[key].physical_model;
                        if(model == null){
                            model = new BinauralModel(audio_context);
                            sources[key].physical_model = model;
                        }
                        model.connect(gain, output);
                }
            }else{
                document.getElementById('model_settings').style.display = 'none';
                for(var key in sources){
                    try{
                        var gain = sources[key].gain;
                        var panner = sources[key].panner;
                        panner.panningModel = algorithm;
                        gain.disconnect();
                        gain.connect(panner);
                        var model = sources[key].physical_model;
                        if(model != null){
                            model.disconnect();
                        }
                    }catch(e){
                        console.log(e);
                    }
                }
            }
        });
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="playback"]'), function(radio) {
        radio.addEventListener('change', function(){
            var value = document.querySelector('input[name="playback"]:checked').value;
            if(value == 'speakers'){
                document.getElementById('crosstalk_settings').style.display = 'block';
                if(xtc === undefined){
                    xtc = new CrosstalkCancel(audio_context);
                }
                xtc.connect(output, audio_context.destination);
            }else{
                document.getElementById('crosstalk_settings').style.display = 'none';
                try{
                    xtc.disconnect();
                }catch(e) {
                    console.log(e);
                }
                output.disconnect();
                output.connect(audio_context.destination);
                output.connect(script_processor);
            }
        });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.slider'), function(slider) {
        slider.oninput = function(e){
            this.nextElementSibling.value  = this.value;
            console.log(this.parentElement);
            xtc[this.name] = parseFloat(this.value);
        };
    });
    Array.prototype.forEach.call(document.querySelectorAll('.output'), function(output) {
        output.oninput = function(e){
            this.previousElementSibling.value = this.value;
            xtc[this.previousElementSibling.name] = parseFloat(this.value);
        };
    });
    Array.prototype.forEach.call(document.querySelectorAll('.slider_model'), function(slider) {
        slider.oninput = function(e){
            this.nextElementSibling.value  = this.value;
            for(var key in sources){
                var source = sources[key];
                source.physical_model[this.name] = parseFloat(this.value);
            }
        };
    });
    document.onkeypress = function (e) {
        e = e || window.event;
        if(e.keyCode == 32){
            e.preventDefault();
            var play_button = document.getElementById('play_button');
            play_button.click();
        }
    };
}


function handleFileSelect(e) {
    var input = this;
    var id = this.id
    var files = e.target.files; // FileList object
    for(var f=0;f<files.length;f++){
        var file = files[f];
        if(f > 0){
            var input = add_input();
            input = input.getElementsByTagName('input')[0];
            id = input.id;
        }
        var reader = new FileReader();
        // Closure to capture the file information.
        reader.onload = (function(theFile, id) {
            return function(e) {
                audio_context.decodeAudioData(e.target.result, function(buffer){
                    create_source(buffer, id);
                });
            };
        })(file, id);
        reader.readAsArrayBuffer(file);
    }
}

function create_source(buffer, id) {
    if(!(id in sources)){
        sources[id] = {};
    }
    sources[id].buffer = buffer;
    sources[id].audio_source = load_buffer(buffer, id);
    if(!sources[id].fileinput){
        add_input('default');
    }else if(document.getElementById(id).parentElement.nextElementSibling == null){
        add_input();
    }
    if(!sources[id].ball){
        sources[id].ball = create_ball(id, sources[id].color);
    }
    sources[id].source_button.style.opacity = 1;
    sources[id].ball.render.visible = true;
}


function add_input(id){
    var settings = document.getElementById('settings_div');
    var source_div = document.createElement('div');
    var file_input = document.createElement('input');
    var source_button = document.createElement('button');
    var elevation_slider = document.createElement('div');
    file_input.type = 'file';
    file_input.accept = 'audio/*';
    file_input.multiple = "multiple";

    if(id === undefined){
        id = Date.now();
        sources[id] = {};
    }
    file_input.id = id;
    file_input.onchange = handleFileSelect;
    sources[id].fileinput = file_input;
	sources[id].color = distinct_colors.next();
	sources[id].source_button = source_button;

	source_button.classList.add('source_button');
	source_button.style.backgroundColor = 'hsl(' + sources[id].color + ', 100%, 50%)';
	source_button.style.borderColor= 'hsl(' + sources[id].color + ', 100%, 30%)';
    source_button.style.opacity = 0.3;
	source_button.addEventListener('click', function(){
		toggle_source(id);
	});

    elevation_slider.classList.add('elevation_slider');
    elevation_slider.classList.add('noUi-extended');
	noUiSlider.create(elevation_slider, {
        start: 0,
        step: 1,
        animate: true,
        orientation: "vertical",
        direction: 'rtl',
        tooltips: true,
        range: {
            'min': -90,
            'max': 90,
        },
        format: {
            to: function ( value ) {
                return parseInt(value) + '&#x00B0;';
	        },
	        from: function ( value ) {
		        return value.replace('&#x00B0;', '');
	        }
	    },
    });
    sources[id].elevation = 0; 
    elevation_slider.noUiSlider.on('update', function(){
        var degrees = parseInt(elevation_slider.noUiSlider.get().replace('&#x00B0;', ''));
        sources[id].elevation = degrees * (Math.PI/180);

        set_ball_zindex();
    });

    source_div.classList.add('source_div');

    source_div.appendChild(source_button);
    source_div.appendChild(file_input);
    source_div.appendChild(elevation_slider);
    settings.appendChild(source_div);
    return source_div;
}


function toggle_source(id){
    // turn on
    var source = sources[id];
    if(source.buffer == null){
        return;
    }
    if(source.source_button.style.opacity == 0.3){
        source.gain.gain.value = 1;
        source.ball.render.visible = true;
        source.source_button.style.opacity = 1;
        if(document.getElementById('collisions').checked){
            source.ball.collisionFilter.mask = 3;
        }
    // turn off
    }else{
        source.gain.gain.value = 0;
        source.ball.render.visible = false;
        source.source_button.style.opacity = 0.3;
        source.ball.collisionFilter.mask = 1;
    }
}

function distance(pos1, pos2){
    var a = pos1.x - pos2.x;
    var b = pos1.y - pos2.y;
    var c = Math.abs(Math.sqrt(a*a + b*b));
    return c
}

// initialize iterable array of N distinct hsl hues
var distinct_colors = [];
(function(){
	var N = 10;
	for(var i =  0; i < 360; i += 360 / N){
		distinct_colors.push(i);
	}
	distinct_colors.sort(function() {
		return .5 - Math.random();
	});
	distinct_colors.next = (function() {return this[this.push(this.shift())-1];});
})();
