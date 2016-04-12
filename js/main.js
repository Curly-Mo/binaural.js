document.addEventListener("DOMContentLoaded", function(event) { 
    init_physics();
    init_head();
	init_webaudio();
    init_settings();
});

var engine;

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
	console.log(engine);

	var width = engine.render.element.clientWidth;
	var height = engine.render.element.clientHeight;
	engine.render.canvas.width = width;
	engine.render.canvas.height = height;
	var wall_width = 200;
	var offset = 10;
	var walls = [
    	Bodies.rectangle(width/2, height + wall_width/2, width*2, wall_width+offset, {
			isStatic: true,
        	friction: 0,
        	frictionStatic: 0,
			frictionAir: 0,
        	restitution: 1,
		}),
		Bodies.rectangle(width/2, -wall_width/2, width*2, wall_width+offset, {
			isStatic: true,
        	friction: 0,
        	frictionStatic: 0,
			frictionAir: 0,
        	restitution: 1,
		}),
    	Bodies.rectangle(-wall_width/2, height/2, wall_width+offset, height*2, {
			isStatic: true,
        	friction: 0,
        	frictionStatic: 0,
			frictionAir: 0,
        	restitution: 1,
		}),
    	Bodies.rectangle(width + wall_width/2, height/2, wall_width+offset, height*2, {
			isStatic: true,
        	friction: 0,
        	frictionStatic: 0,
			frictionAir: 0,
        	restitution: 1,
		}),
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
            if(!ball){continue;}
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
    });
    ball.render.fillStyle = 'hsl(' + hue + ', 100%, 50%)';
    ball.render.strokeStyle = 'hsl(' + hue + ', 100%, 30%)';
    Matter.World.add(engine.world, ball);
    return ball;
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

var audio_context;
var sources = {};
var listener;
var script_processor;
var doppler = false;

function to_polar(x, y){
    var polar = {};
    polar.radius = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
    polar.angle = Math.atan2(y, x);
    // Shift so that forward is 0
	polar.angle = polar.angle + Math.PI/2;
	if(polar.angle < 0){
        polar.angle += 2*Math.PI;
    }
    // scale distance from [0-0.5] to [0-10]
    polar.radius = polar.radius * 20;
    return polar;
}

function to_cartesian(angle, radius){
    var position = {}
    position.x = radius * Math.sin(angle);
    position.y = radius * Math.cos(angle);
    return position;
}

function init_webaudio(){
	try {
    	// Fix up for prefixing
    	window.AudioContext = window.AudioContext||window.webkitAudioContext;
    	audio_context = new AudioContext();
  	}
  	catch(e) {
    	alert('Web Audio API is not supported in this browser');
  	}
	load_audio('audio/spokey_dokey.wav');
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

    var panner = sources[id].panner;
    if(panner == null){
        panner = audio_context.createPanner();
    }
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 100;
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

    if(script_processor === undefined){
        script_processor = audio_context.createScriptProcessor(512, 1, 1);
        script_processor.onaudioprocess = process_audio;
    }

	source.connect(panner);
	panner.connect(audio_context.destination);
	panner.connect(script_processor);
	script_processor.connect(audio_context.destination);

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
        var position = to_cartesian(polar.angle, polar.radius);
        sources[key].panner.setPosition(position.x, position.y, 0);
        if(doppler){
            sources[key].panner.setVelocity(x, -y, 0);
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
            }else{
                for(var key in sources){
                    sources[key].audio_source.start(0);
                }
            }
        }else if(this.textContent == String.fromCharCode(9646, 9646)){
            this.textContent = String.fromCharCode(9654);
            audio_context.suspend();
        }
    };
}


function handleFileSelect(e) {
    var input = this;
    var id = this.id
    var files = e.target.files; // FileList object
    var file = files[0];
    var reader = new FileReader();
    // Closure to capture the file information.
    reader.onload = (function(theFile) {
        return function(e) {
            audio_context.decodeAudioData(e.target.result, function(buffer){
                create_source(buffer, id);
            });
        };
    })(file);
    reader.readAsArrayBuffer(file);
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
        console.log(document.getElementById(id).parentElement.nextElementSibling);
        add_input();
    }
    if(!sources[id].ball){
        sources[id].ball = create_ball(id, sources[id].color);
    }
}


function add_input(id){
    var settings = document.getElementById('settings_div');
    var source_div = document.createElement('div');
    var file_input = document.createElement('input');
    var source_button = document.createElement('button');
    file_input.type = 'file';
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
	source_button.addEventListener('click', function(){
		toggle_source(id);
	});

    source_div.appendChild(source_button);
    source_div.appendChild(file_input);
    settings.appendChild(source_div);
}


function toggle_source(id){
    // turn on
    var source = sources[id];
    if(source.buffer == null){
        return;
    }
    if(source.source_button.style.opacity == 0.3){
        source.audio_source.connect(source.panner);
        source.ball.render.visible = true;
        source.source_button.style.opacity = 1;
    // turn off
    }else{
        source.audio_source.disconnect();
        source.ball.render.visible = false;
        source.source_button.style.opacity = 0.3;
    }
}

function distance(pos1, pos2){
    var a = pos1.x - pos2.x;
    var b = pos1.y - pos2.y;
    var c = Math.abs(Math.sqrt(a*a + b*b));
    return c
}

// initialize tierable array of N distinct hsl hues
var distinct_colors = [];
(function(){
	var N = 12;
	for(var i =  0; i < 360; i += 360 / N){
		distinct_colors.push(i);
	}
	console.log(distinct_colors);
	distinct_colors.sort(function() {
		return .5 - Math.random();
	});
	distinct_colors.next = (function() {return this[this.push(this.shift())-1];});
})();
