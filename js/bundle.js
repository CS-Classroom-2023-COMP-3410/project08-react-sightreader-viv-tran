(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
const ABC_EXT = '.abc';
const PLS_EXT = '.pls';
const Pitchfinder = require('pitchfinder');
let detectPitch = null;
// const detectPitch = new Pitchfinder.AMDF(); // .YIN() confuses B3 with B4?

const NOTE_COLOR_DEFAULT = '#000000';
const NOTE_COLOR_PLAYING = '#3D9AFC';
const DEFAULT_SCALE = 1.5;
const DEFAULT_TEMPO = 60;
const SILENCE = '-';
const MIN_VOLUME = 0.075;

// Circle variables
const scales = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Text variables
let current_midi_number = 0;
let expected_midi_number = 0;
let current_score_stats = null;
let scroll_offset = 0;
let current_qpm = null;

let audioContext = new AudioContext();
let pitch_detector = null;
let recording = false;
let tunebook;
let sum_width = 0;
let original_loaded_abc = null;
let loaded_abc = null; // ABC loaded into ABCjs
let loaded_abc_raw = null;
let timer = null;
let synth = null;
let current_event = null;
let countdown = 3;
let source_stream;

// Playlist variables.
let playlist_files = [];
let playlist_index = 0;
let note_checker_id = null;
let new_note_checked = false;
let new_note_checked_and_found = false;
let notes_checked_count = 0;
let notes_checked_correct_count = 0;
let pitch_checker_id = null;
let pitch_getter_id = null;
let volume_meter = null;
let loaded_abc_filename = null;

const notation_display = document.querySelector('#notation');
const abc_textarea = document.querySelector('#abc-textarea');
const midi_player = document.querySelector('#midi');
const start_button = document.querySelector('#start');
const reset_button = document.querySelector('#reset');
const devices_select = document.querySelector('#devices');
const file_select = document.querySelector('#file');
const tempo_select = document.querySelector('#tempo');
const tune_button = document.querySelector('#tune');
const current_note_display = document.querySelector('#current-note');
const current_score_display = document.querySelector('#current-score');
const countdown_display = document.querySelector('#count-down');
const volume_display = document.querySelector('#current-volume');
const playlist_display = document.querySelector('#playlist');
const current_playlist_position_display = document.querySelector('#current-playlist-position');
const score_stats_display = document.querySelector('#score-stats');
const loaded_filename_display = document.querySelector('#loaded-filename');
const qpm_display = document.querySelector('#qpm-display');
const auto_continue = document.querySelector('#auto-continue');
const ignore_duration = document.querySelector('#ignore-duration');
const profile_select = document.querySelector('#profiles');
const create_new_profile_input = document.querySelector('#newProfile');

window.start_button = start_button;

function clamp(val, min, max) {
    return val > max ? max : val < min ? min : val;
}

function is_auto_continue() {
    return $('#' + auto_continue.id).is(':checked');
}

function is_ignore_duration() {
    return $('#' + ignore_duration.id).is(':checked');
}

// Compare the note expected to be played against the note currently detected on the mic and update score.
function check_note() {
    if (isNaN(current_midi_number)) {
        current_midi_number = 0;
    }
    if (isNaN(expected_midi_number)) {
        expected_midi_number = 0;
    }
    if(is_ignore_duration()){
        // If we're ignoring duration, then only increase our correct note count if the note is met at least once.
        if(!new_note_checked){
            new_note_checked = true;
            notes_checked_count += 1;
        }
        if(!new_note_checked_and_found && expected_midi_number == current_midi_number){
            new_note_checked_and_found = true;
            notes_checked_correct_count += 1;
        }
    }else{
        // Otherwise, assume the note must be met throughout the entire duration.
        notes_checked_correct_count += expected_midi_number == current_midi_number;
        notes_checked_count += 1;
    }
    update_score_display();
}

function is_startable() {
    return source_stream && tunebook && tunebook[0].lines.length > 0;
}

function update_qpm_display() {
    qpm_display.textContent = '-';
    if (current_qpm) {
        qpm_display.textContent = current_qpm;
    }
}

function update_start_button() {
    if (is_startable()) {
        start_button.disabled = false;
        return;
    }
    start_button.disabled = true;
}

function color_note(event, color) {
    if (event == null || !event.elements) {
        return;
    }
    for (let e of event.elements) {
        for (let s of e) {
            s.setAttribute('fill', color);
        }
    }
}

function load_abc(abc_string) {
    var qpm = null;
    var qpm_override = false;
    var abc_string_raw = abc_string;
    stop();
    // Find final QPM.
    if (tempo_select.value) {
        // Use tempo override control.
        qpm = parseInt(tempo_select.value);
        qpm_override = true;
    } else {
        // Otherwise extract from ABC.
        var qpm_matches = abc_string.match(/Q:\s*(\d+)/i);
        if (qpm_matches) {
            qpm = parseInt(qpm_matches[1]);
            // Remove from ABC so it's not rendered with the sheet music.
            abc_string = abc_string.replace(/Q:\s*(\d+\n)/i, '');
        }
    }
    qpm = parseInt(qpm || DEFAULT_TEMPO);

    loaded_abc_raw = abc_string_raw;
    loaded_abc = abc_string;
    current_qpm = qpm;
    update_qpm_display();

    tunebook = ABCJS.renderAbc(notation_display.id, abc_string, {
        responsive: "resize",
        scale: DEFAULT_SCALE,
        add_classes: true
    });

    $('#notation').css('opacity', 0.5);

    if (!synth) {
        synth = new ABCJS.synth.CreateSynth();
    }

    start_button.disabled = true;
    synth
        .init({
            audioContext: audioContext,
            visualObj: tunebook[0],
            millisecondsPerMeasure: milliseconds_per_measure(current_qpm, tunebook[0]),
        })
        .then(() => {
            synth.prime().then(() => {
                start_button.disabled = false;
            });
        });
}

function mark_start_button_as_started() {
    start_button.textContent = 'Stop';
}

function mark_start_button_as_stopped() {
    start_button.textContent = 'Start';
}

function begin_countdown() {
    mark_start_button_as_started();
    recording = true;
    countdown = tunebook[0].getBeatsPerMeasure() + 1;
    refresh_countdown();
}

function refresh_countdown() {
    countdown -= 1;
    if (countdown > 0) {
        countdown_display.textContent = tunebook[0].getBeatsPerMeasure() - countdown + 1;
        $('#count-down').css({'font-size': '15em', 'opacity' : 1.0}).show().animate({opacity: '0'}, milliseconds_per_beat(current_qpm), 'swing', refresh_countdown);
    } else {
        $('#count-down').hide();
        if (countdown == 0) {
            start();
        }
    }
}

function load_playlist_file(filename) {
    $.ajax({
        url: 'playlist/' + filename,
        dataType: 'json',
        success: function (data, textStatus, jqXHR) {
            var playlist = $('#' + playlist_display.id);
            clear_playlist();
            playlist_files = data;
            playlist_index = 0;
            for (var i = 0; i < data.length; i += 1) {
                playlist.append('<li class="list-group-item" data-playlist-index="' + i + '">' + data[i] + '</li>');
            }
            if (playlist_files) {
                update_playlist();
            }
            $('#playlist li').click(function () {
                var el = $(this);
                var index = parseInt(el.data('playlist-index'));
                // console.log('Loading index ' + index);
                goto_playlist_index(index);
            });
        },
        error: function (jqXHR, textStatus, errorThrown) {
            report_status('Unable to load playlist file: ' + filename);
            update_start_button();
        },
    });
}

function load_abc_file(filename) {
    if (!filename) {
        return;
    }
    loaded_filename_display.textContent = '';
    $.ajax({
        url: 'abc/single/' + filename,
        dataType: 'text',
        success: function (data, textStatus, jqXHR) {
            original_loaded_abc = data;
            loaded_abc_filename = filename;
            loaded_filename_display.textContent = filename;
            $('#abc-textarea').val(data);
            load_abc(data);
            $(file_select.id).removeAttr('disabled');
            report_status('File loaded. Press start to play.');
            update_start_button();
            update_score_stats_display();
        },
        error: function (jqXHR, textStatus, errorThrown) {
            report_status('Unable to load file.');
            update_start_button();
        },
    });
}

function load_abc_textarea() {
    loaded_filename_display.textContent = '';
    data = $('#abc-textarea').val();
    original_loaded_abc = data;
    load_abc(data);
    $(file_select.id).removeAttr('disabled');

    if(tunebook && tunebook[0].lines.length > 0) {
        loaded_abc_filename = tunebook[0].metaText.title;
        report_status('File loaded. Press start to play.');
        update_score_stats_display();
    } else {
        report_status('Invalid ABC text. Please try again.');
    }

    update_start_button();
}

function milliseconds_per_beat(qpm) {
    return 60000 / qpm;
}

function milliseconds_per_measure(qpm, tune) {
    return tune.getBeatsPerMeasure() * milliseconds_per_beat(qpm);
}

// https://newt.phys.unsw.edu.au/jw/notes.html
function midi_number_to_octave(number) {
    octave = parseInt(number / 12) - 1;
    return octave;
}
window.midi_number_to_octave = midi_number_to_octave;

function midi_number_to_scale(number) {
    return scales[number % 12];
}

function midi_number_to_string(number) {
    if (number) {
        return midi_number_to_scale(number) + midi_number_to_octave(number);
    }
    return SILENCE;
}
window.midi_number_to_string = midi_number_to_string;

function noteFromPitch(frequency) {
    var noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
    return Math.round(noteNum) + 69;
}
window.noteFromPitch = noteFromPitch;

function start_pitch_detector() {
    audioContext.resume();
    detectPitch = new Pitchfinder.YIN({sampleRate : audioContext.sampleRate});
    var sourceNode = audioContext.createMediaStreamSource(source_stream);
    var analyser = audioContext.createAnalyser();
    sourceNode.connect(analyser);
    const arrayUInt = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(arrayUInt);

    function get_pitch() {
        var volume = volume_meter.volume;
        current_midi_number = 0;
        if (volume > MIN_VOLUME) {
            const array32 = new Float32Array(analyser.fftSize);
            analyser.getFloatTimeDomainData(array32);
            var freq = detectPitch(array32);
            // console.log('freq:'+freq)
            current_midi_number = parseInt(noteFromPitch(freq));
            if (isNaN(current_midi_number)) {
                current_midi_number = 0;
            }
        }
        update_current_note_display();
        update_current_volume_display();
    }
    pitch_getter_id = setInterval(get_pitch, 10);
}

function stop_pitch_detector() {
    if (pitch_getter_id) {
        clearInterval(pitch_getter_id);
    }
    if (pitch_detector) {
        pitch_detector.destroy();
    }
    pitch_detector = null;
    current_midi_number = 0;
}

function start_volume_meter() {
    if (!volume_meter) {
        volume_meter = createAudioMeter(audioContext);
        var mediaStreamSource = audioContext.createMediaStreamSource(source_stream);
        mediaStreamSource.connect(volume_meter);
    }
}

function update_current_volume_display() {
    var volume;
    if (recording && volume_meter) {
        volume = parseInt(Math.round(volume_meter.volume * 100));
    } else {
        volume = '-';
    }
    volume_display.textContent = '' + volume;
}

function start_mic() {
    console.log('Starting mic...');
    recording = true;
    audioContext.resume().then(() => {
        console.log('Playback resumed successfully');
    });
    start_volume_meter();
    start_pitch_detector();
}

function stop_mic() {
    current_midi_number = 0;
    recording = false;
    stop_pitch_detector();
}

function start_note_checker() {
    note_checker_id = setInterval(check_note, 100);
}

function stop_note_checker() {
    if (note_checker_id) {
        clearInterval(note_checker_id);
    }
    if (pitch_checker_id) {
        clearInterval(pitch_checker_id);
    }
    note_checker_id = null;
    pitch_checker_id = null;
}

function event_callback(event) {
    if (current_event) {
        color_note(current_event, NOTE_COLOR_DEFAULT);
    }
    if (event) {
        new_note_checked = false;
        new_note_checked_and_found = false;
        color_note(event, NOTE_COLOR_PLAYING);
        current_event = event;

        // Sometimes the pitch array is empty if there's a rest.
        var midiPitch = event.midiPitches && event.midiPitches[0];
        if (!midiPitch) {
            expected_midi_number = 0;
            update_current_note_display();
            return;
        }

        expected_midi_number = midiPitch.pitch;
        update_current_note_display();

        var duration_ms = event.midiPitches[0].durationInMeasures * milliseconds_per_measure(current_qpm, tunebook[0]);
        // var offset = -current_event.left * DEFAULT_SCALE + 50;
        // $('#notation svg').animate({marginLeft: offset + 'px'}, 0); //duration_ms/2);
    } else {
        // Reached the end.
        stop_note_checker();
        var score = get_score_percent();
        report_status('Scored ' + score + '.');
        record_score(score);
        update_score_stats_display();
        stop(false);
        setTimeout(reset, 100);
        // If auto-continue is enabled and our last score was greater or equall to the average, then immediately start playing next.
        if (is_auto_continue()) {
            if (current_score_stats.mean_score && get_score_percent() >= current_score_stats.mean_score) {
                console.log('Auto-incrementing playlist.');
                increment_playlist();
            }
            if (!at_playlist_end() || (current_score_stats.mean_score && get_score_percent() < current_score_stats.mean_score)) {
                setTimeout(auto_start, 3000);
            }
        }
    }
}

function auto_start() {
    console.log('Auto-starting.');
    start_button.click();
}
window.auto_start = auto_start;

function start() {
    console.log('Starting...');

    timer = new ABCJS.TimingCallbacks(tunebook[0], {
        qpm: current_qpm,
        extraMeasuresAtBeginning: 0,
        lineEndAnticipation: 0,
        beatSubdivisions: 4,
        beatCallback: function (beatNumber, totalBeats, totalTime) {
            // console.log("beatCallback: " + beatNumber + ", " + totalBeats + ", " + totalTime);
        },
        eventCallback: event_callback,
        lineEndCallback: function (info) {
            // console.log('lineEndCallback:');
            // console.log(info);
        },
    });

    notes_checked_count = 0;
    notes_checked_correct_count = 0;
    sum_width = 0;
    start_mic();
    mark_start_button_as_started();
    start_note_checker();
    timer.start();
    synth.start();
    report_status('Playing.');
    $('#notation').css('opacity', 1);
}

function get_score_percent() {
    return parseInt(Math.round((notes_checked_correct_count / notes_checked_count) * 100));
}

function reset_score_display_style() {
    var el = $('#' + current_score_display.id);
    el.removeClass('good');
    el.removeClass('bad');
}

function update_score_display() {
    var el = $('#' + current_score_display.id);
    reset_score_display_style();
    if (notes_checked_count) {
        percent = get_score_percent();
        el.text('' + notes_checked_correct_count + '/' + notes_checked_count + ' = ' + percent + '%');
        if (current_score_stats && current_score_stats.mean_score) {
            if (percent >= current_score_stats.mean_score) {
                el.addClass('good');
            } else {
                el.addClass('bad');
            }
        }
    } else {
        el.text('-');
    }
}

function stop(verbose) {
    if (verbose == null) {
        verbose = true;
    }
    if (countdown >= 0) {
        countdown = -1;
        recording = true;
    }
    if (!recording) {
        return;
    }
    $('#notation').css('opacity', 0.5);
    stop_mic();
    expected_midi_number = 0;
    current_midi_number = 0;
    stop_note_checker();
    mark_start_button_as_stopped();
    ABCJS.midi.stopPlaying();
    if (timer) {
        timer.stop();
    }
    if (synth) {
        synth.stop();
    }
    if (verbose) {
        report_status('Stopped.');
    }
    if (current_event) {
        color_note(current_event, NOTE_COLOR_DEFAULT);
    }
}
window.stop = stop;

function reset() {
    notes_checked_count = 0;
    scroll_offset = 0;
    update_scroll();
    stop();
    ABCJS.midi.restartPlaying();
    if (timer) {
        timer.reset();
    }
    $('#notation svg').css('marginLeft', '0px');
    update_playlist();
}
window.reset = reset;

function report_status(message) {
    $('#status').html(message);
}

function reset_current_note_display_style() {
    var el = $('#' + current_note_display.id);
    el.removeClass('good');
    el.removeClass('bad');
}

function update_current_note_display() {
    var el = $('#' + current_note_display.id);
    reset_current_note_display_style();
    if (expected_midi_number) {
        if (expected_midi_number == current_midi_number) {
            el.addClass('good');
        } else {
            el.addClass('bad');
        }
    }
    current_note_display.textContent = midi_number_to_string(expected_midi_number) + '/' + midi_number_to_string(current_midi_number);
}
window.update_current_note_display = update_current_note_display;

function record_score(score) {
    $.ajax({
        url: 'score/set/' + loaded_abc_filename + '/' + score + '/' + current_qpm + '/' + profile_select.value,
        dataType: 'text',
        success: function (data, textStatus, jqXHR) {
            console.log('Score saved!');
        },
        error: function (jqXHR, textStatus, errorThrown) {
            console.log('Error saving score!');
        },
    });
}

function scroll_left() {
    scroll_offset -= 100;
    scroll_offset = Math.max(scroll_offset, 0);
    update_scroll();
}

function scroll_right() {
    scroll_offset += 100;
    update_scroll();
}

function update_scroll() {
    $('#' + notation_display.id + ' svg').css('transform-origin-x', scroll_offset);
}

function goto_playlist_index(i) {
    var _playlist_index = playlist_index;
    playlist_index = i;
    playlist_index = clamp(playlist_index, 0, playlist_files.length - 1);
    if (_playlist_index != playlist_index) {
        update_playlist();
    }
}

function at_playlist_end() {
    return !playlist_files.length || playlist_index == playlist_files.length - 1;
}

function increment_playlist() {
    var _playlist_index = playlist_index;
    playlist_index += 1;
    playlist_index = clamp(playlist_index, 0, playlist_files.length - 1);
    if (_playlist_index != playlist_index) {
        update_playlist();
    }
}
window.increment_playlist = increment_playlist;

function decrement_playlist() {
    var _playlist_index = playlist_index;
    playlist_index -= 1;
    playlist_index = clamp(playlist_index, 0, playlist_files.length - 1);
    if (_playlist_index != playlist_index) {
        update_playlist();
    }
}

function clear_playlist() {
    playlist_files = [];
    playlist_index = 0;
    var playlist = $('#' + playlist_display.id);
    playlist.empty();
}

function update_playlist() {
    notes_checked_correct_count = 0;
    notes_checked_count = 0;
    reset_score_display_style();
    reset_current_note_display_style();
    update_score_display();
    $('li').removeClass('active');
    $('li[data-playlist-index=' + playlist_index + ']').addClass('active');
    var fn = playlist_files[playlist_index];
    load_abc_file(fn);
    if (playlist_files.length) {
        current_playlist_position_display.textContent = '' + (playlist_index + 1) + '/' + playlist_files.length;
    } else {
        current_playlist_position_display.textContent = '';
    }
}
window.update_playlist = update_playlist;

function update_score_stats_display() {
    $.ajax({
        url: 'score/get/' + loaded_abc_filename + '/' + current_qpm + '/' + profile_select.value,
        dataType: 'json',
        success: function (data, textStatus, jqXHR) {
            current_score_stats = data;
            score_stats_display.textContent = '';
            if (data.most_recent_scores.length) {
                score_stats_display.textContent = '' + data.min_score + '/' + data.mean_score + '/' + data.max_score;
            }
        },
        error: function (jqXHR, textStatus, errorThrown) {
            console.log('Error retrieving score statistics!');
        },
    });
}
window.update_score_stats_display = update_score_stats_display;

auto_continue.addEventListener('click', async (e) => {
    Cookies.set(auto_continue.id, is_auto_continue() ? 1 : 0);
});

ignore_duration.addEventListener('click', async (e) => {
    Cookies.set(ignore_duration.id, is_ignore_duration() ? 1 : 0);
});

profile_select.addEventListener('change', async (e) => {
    if(e.target.value == 'new'){
        $('#'+profile_select.id).hide();
        $('#'+create_new_profile_input.id).show();
    }else{
        Cookies.set(profile_select.id, profile_select.value);
        $('#'+profile_select.id).show();
        $('#'+create_new_profile_input.id).hide();
        update_score_stats_display();
    }
});

create_new_profile_input.addEventListener('keydown', async (e) => {
    //console.log(event.keyCode)
    if (event.keyCode == 27) {
        // Escape.
        create_new_profile_input.value = '';
        $('#'+profile_select.id).show();
        $('#'+create_new_profile_input.id).hide();
    }else if (event.keyCode == 13) {
        $.ajax({
            url: '/profile/save/'+create_new_profile_input.value,
            dataType: 'json',
            success: function (data, textStatus, jqXHR) {
                console.log('Success saving profile!');
                $('#'+profile_select.id).append('<option value="'+create_new_profile_input.value+'">'+create_new_profile_input.value+'</option>');
                profile_select.value = create_new_profile_input.value;
                $('#'+profile_select.id).show();
                create_new_profile_input.value = '';
                $('#'+create_new_profile_input.id).hide();
            },
            error: function (jqXHR, textStatus, errorThrown) {
                console.log('Error saving profile!');
            },
        });
    }
});


// Runs whenever a different audio input device is selected by the user.
devices_select.addEventListener('change', async (e) => {
    if (e.target.value) {
        if (recording) {
            stop();
        }

        // Retrieve the MediaStream for the selected audio input device.
        source_stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: {
                    exact: e.target.value,
                },
            },
        });

        update_start_button();
    }
});

navigator.getUserMedia = (navigator.getUserMedia ||
                       navigator.webkitGetUserMedia ||
                       navigator.mozGetUserMedia ||
                       navigator.msGetUserMedia);
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({audio: true}).then((stream) => {
        navigator.mediaDevices.enumerateDevices().then((devices) => {
            const fragment = document.createDocumentFragment();
            if (devices) {
                devices.forEach((device) => {
                    if (device.kind === 'audioinput') {
                        const option = document.createElement('option');
                        option.textContent = device.label;
                        option.value = device.deviceId;
                        fragment.appendChild(option);
                    }
                });
            }
            devices_select.appendChild(fragment);

            // Run the event listener on the `<select>` element after the input devices
            // have been populated. This way the record button won't remain disabled at
            // start.
            devices_select.dispatchEvent(new Event('change'));
        });
    });
}else{
    $('#message-model .modal-body').html('This browser is not supported.');
    $('#message-model').modal('show');
}

function _file_select_change(){
    var filename = file_select.value;
    report_status('Loading file ' + filename + '.');
    clear_playlist();
    update_playlist();
    if (filename.endsWith(ABC_EXT)) {
        $('#abc-textarea-container').hide();
        load_abc_file(filename);
    } else if(filename.endsWith(PLS_EXT)) {
        $('#abc-textarea-container').hide();
        load_playlist_file(filename);
    } else {
        $('#abc-textarea-container').show();
        load_abc($('#abc-textarea').val());
    }
    file_select.blur();
    Cookies.set(file_select.id, filename);
}

file_select.addEventListener('change', () => {
    _file_select_change();
});

function abc_textarea_change(){
    load_abc_textarea();
}

abc_textarea.addEventListener('change', () => {
    abc_textarea_change();
});

tune_button.addEventListener('click', () => {
    if (recording) {
        stop_mic();
        $('#' + tune_button.id).removeClass('active');
        update_start_button();
    } else {
        start_button.disabled = true;
        start_mic();
        $('#' + tune_button.id).addClass('active');
    }
    update_current_volume_display();
});

tempo_select.addEventListener('change', () => {
    if (loaded_abc) {
        load_abc(original_loaded_abc);
        // Score is kept separately for each tempo, so we have to update our stats whenever the tempo changes.
        update_score_stats_display();
    }
});

// Runs when the user clicks the record button.
start_button.addEventListener('click', (event) => {
    if (event.target.disabled || !(tunebook && tunebook[0].lines.length > 0)) {
        report_status('Select a file before starting.');
        return;
    }
    if (recording) {
        stop();
    } else {
        begin_countdown();
    }
    update_current_volume_display();
});

reset_button.addEventListener('click', (event) => {
    if (event.target.disabled || !file_select.value) {
        report_status('Select a file before resetting.');
        return;
    } else {
        reset();
    }
    update_score_display();
});

$(document).keypress(function (e) {
    //console.log('Pressed:'+e.keyCode)
    switch (e.keyCode) {
        case 115:
            // s = start/stop
            start_button.click();
            break;
        case 114:
            // r = reset
            reset_button.click();
            break;
        case 116:
            // t = tune
            tune_button.click();
            break;
        case 110:
            // n = next playlist item
            increment_playlist();
            break;
        case 98:
            // b = back playlist item
            decrement_playlist();
            break;
        case 106:
            // j = scroll left
            scroll_left();
            break;
        case 107:
            // j = scroll right
            scroll_right();
            break;
    }
});

$(document).ready(function () {
    var cb;
    // Load saved auto continue state.
    cb = parseInt(Cookies.get(auto_continue.id));
    if (!isNaN(cb)) {
        $('#' + auto_continue.id).prop('checked', cb);
    }
    // Load saved ignore duration state.
    cb = parseInt(Cookies.get(ignore_duration.id));
    if (!isNaN(cb)) {
        $('#' + ignore_duration.id).prop('checked', cb);
    }
    // Load saved selected profile.
    cb = Cookies.get(profile_select.id);
    if (cb) {
        profile_select.value = cb;
    }
    // Load saved selected file.
    cb = Cookies.get(file_select.id);
    if (cb) {
        file_select.value = cb;
        _file_select_change();
    }
});

},{"pitchfinder":7}],2:[function(require,module,exports){
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
var DEFAULT_PARAMS = {
    sampleRate: 44100,
};
function ACF2PLUS(params) {
    if (params === void 0) { params = DEFAULT_PARAMS; }
    var config = __assign(__assign({}, DEFAULT_PARAMS), params);
    var sampleRate = config.sampleRate;
    // Implements the ACF2+ algorithm
    return function ACF2PLUSDetector(float32AudioBuffer) {
        var maxShift = float32AudioBuffer.length;
        var rms = 0;
        var i, j, u, tmp;
        for (i = 0; i < maxShift; i++) {
            tmp = float32AudioBuffer[i];
            rms += tmp * tmp;
        }
        rms = Math.sqrt(rms / maxShift);
        if (rms < 0.01)
            // not enough signal
            return -1;
        /* Trimming cuts the edges of the signal so that it starts and ends near zero.
         This is used to neutralize an inherent instability of the ACF version I use.*/
        var aux1 = 0;
        var aux2 = maxShift - 1;
        var thres = 0.2;
        for (i = 0; i < maxShift / 2; i++)
            if (Math.abs(float32AudioBuffer[i]) < thres) {
                aux1 = i;
                break;
            }
        for (i = 1; i < maxShift / 2; i++)
            if (Math.abs(float32AudioBuffer[maxShift - i]) < thres) {
                aux2 = maxShift - i;
                break;
            }
        var frames = float32AudioBuffer.slice(aux1, aux2);
        var framesLength = frames.length;
        var calcSub = new Array(framesLength).fill(0);
        for (i = 0; i < framesLength; i++)
            for (j = 0; j < framesLength - i; j++)
                calcSub[i] = calcSub[i] + frames[j] * frames[j + i];
        u = 0;
        while (calcSub[u] > calcSub[u + 1])
            u++;
        var maxval = -1, maxpos = -1;
        for (i = u; i < framesLength; i++) {
            if (calcSub[i] > maxval) {
                maxval = calcSub[i];
                maxpos = i;
            }
        }
        var T0 = maxpos;
        /* Interpolation is parabolic interpolation. It helps with precision.
         We suppose that a parabola pass through the three points that comprise the peak.
         'a' and 'b' are the unknowns from the linear equation system
         and b/(2a) is the "error" in the abscissa.
         y1,y2,y3 are the ordinates.*/
        var y1 = calcSub[T0 - 1], y2 = calcSub[T0], y3 = calcSub[T0 + 1];
        var a = (y1 + y3 - 2 * y2) / 2;
        var b = (y3 - y1) / 2;
        if (a)
            T0 = T0 - b / (2 * a);
        return sampleRate / T0;
    };
}
exports.ACF2PLUS = ACF2PLUS;

},{}],3:[function(require,module,exports){
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
var DEFAULT_AMDF_PARAMS = {
    sampleRate: 44100,
    minFrequency: 82,
    maxFrequency: 1000,
    ratio: 5,
    sensitivity: 0.1,
};
function AMDF(params) {
    if (params === void 0) { params = {}; }
    var config = __assign(__assign({}, DEFAULT_AMDF_PARAMS), params);
    var sampleRate = config.sampleRate;
    var minFrequency = config.minFrequency;
    var maxFrequency = config.maxFrequency;
    var sensitivity = config.sensitivity;
    var ratio = config.ratio;
    var amd = [];
    /* Round in such a way that both exact minPeriod as
     exact maxPeriod lie inside the rounded span minPeriod-maxPeriod,
     thus ensuring that minFrequency and maxFrequency can be found
     even in edge cases */
    var maxPeriod = Math.ceil(sampleRate / minFrequency);
    var minPeriod = Math.floor(sampleRate / maxFrequency);
    return function AMDFDetector(float32AudioBuffer) {
        var maxShift = float32AudioBuffer.length;
        var t = 0;
        var minval = Infinity;
        var maxval = -Infinity;
        var frames1, frames2, calcSub, i, j, u, aux1, aux2;
        // Find the average magnitude difference for each possible period offset.
        for (i = 0; i < maxShift; i++) {
            if (minPeriod <= i && i <= maxPeriod) {
                for (aux1 = 0, aux2 = i, t = 0, frames1 = [], frames2 = []; aux1 < maxShift - i; t++, aux2++, aux1++) {
                    frames1[t] = float32AudioBuffer[aux1];
                    frames2[t] = float32AudioBuffer[aux2];
                }
                // Take the difference between these frames.
                var frameLength = frames1.length;
                calcSub = [];
                for (u = 0; u < frameLength; u++) {
                    calcSub[u] = frames1[u] - frames2[u];
                }
                // Sum the differences.
                var summation = 0;
                for (u = 0; u < frameLength; u++) {
                    summation += Math.abs(calcSub[u]);
                }
                amd[i] = summation;
            }
        }
        for (j = minPeriod; j < maxPeriod; j++) {
            if (amd[j] < minval)
                minval = amd[j];
            if (amd[j] > maxval)
                maxval = amd[j];
        }
        var cutoff = Math.round(sensitivity * (maxval - minval) + minval);
        for (j = minPeriod; j <= maxPeriod && amd[j] > cutoff; j++)
            ;
        var searchLength = minPeriod / 2;
        minval = amd[j];
        var minpos = j;
        for (i = j - 1; i < j + searchLength && i <= maxPeriod; i++) {
            if (amd[i] < minval) {
                minval = amd[i];
                minpos = i;
            }
        }
        if (Math.round(amd[minpos] * ratio) < maxval) {
            return sampleRate / minpos;
        }
        else {
            return null;
        }
    };
}
exports.AMDF = AMDF;

},{}],4:[function(require,module,exports){
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
var MAX_FLWT_LEVELS = 6;
var MAX_F = 3000;
var DIFFERENCE_LEVELS_N = 3;
var MAXIMA_THRESHOLD_RATIO = 0.75;
var DEFAULT_DYNAMIC_WAVELET_CONFIG = {
    sampleRate: 44100,
};
function DynamicWavelet(params) {
    if (params === void 0) { params = {}; }
    var config = __assign(__assign({}, DEFAULT_DYNAMIC_WAVELET_CONFIG), params);
    var sampleRate = config.sampleRate;
    return function DynamicWaveletDetector(float32AudioBuffer) {
        var mins = [];
        var maxs = [];
        var bufferLength = float32AudioBuffer.length;
        var freq = null;
        var theDC = 0;
        var minValue = 0;
        var maxValue = 0;
        // Compute max amplitude, amplitude threshold, and the DC.
        for (var i = 0; i < bufferLength; i++) {
            var sample = float32AudioBuffer[i];
            theDC = theDC + sample;
            maxValue = Math.max(maxValue, sample);
            minValue = Math.min(minValue, sample);
        }
        theDC /= bufferLength;
        minValue -= theDC;
        maxValue -= theDC;
        var amplitudeMax = maxValue > -1 * minValue ? maxValue : -1 * minValue;
        var amplitudeThreshold = amplitudeMax * MAXIMA_THRESHOLD_RATIO;
        // levels, start without downsampling...
        var curLevel = 0;
        var curModeDistance = -1;
        var curSamNb = float32AudioBuffer.length;
        var delta, nbMaxs, nbMins;
        // Search:
        while (true) {
            delta = ~~(sampleRate / (Math.pow(2, curLevel) * MAX_F));
            if (curSamNb < 2)
                break;
            var dv = void 0;
            var previousDV = -1000;
            var lastMinIndex = -1000000;
            var lastMaxIndex = -1000000;
            var findMax = false;
            var findMin = false;
            nbMins = 0;
            nbMaxs = 0;
            for (var i = 2; i < curSamNb; i++) {
                var si = float32AudioBuffer[i] - theDC;
                var si1 = float32AudioBuffer[i - 1] - theDC;
                if (si1 <= 0 && si > 0)
                    findMax = true;
                if (si1 >= 0 && si < 0)
                    findMin = true;
                // min or max ?
                dv = si - si1;
                if (previousDV > -1000) {
                    if (findMin && previousDV < 0 && dv >= 0) {
                        // minimum
                        if (Math.abs(si) >= amplitudeThreshold) {
                            if (i > lastMinIndex + delta) {
                                mins[nbMins++] = i;
                                lastMinIndex = i;
                                findMin = false;
                            }
                        }
                    }
                    if (findMax && previousDV > 0 && dv <= 0) {
                        // maximum
                        if (Math.abs(si) >= amplitudeThreshold) {
                            if (i > lastMaxIndex + delta) {
                                maxs[nbMaxs++] = i;
                                lastMaxIndex = i;
                                findMax = false;
                            }
                        }
                    }
                }
                previousDV = dv;
            }
            if (nbMins === 0 && nbMaxs === 0) {
                // No best distance found!
                break;
            }
            var d = void 0;
            var distances = [];
            for (var i = 0; i < curSamNb; i++) {
                distances[i] = 0;
            }
            for (var i = 0; i < nbMins; i++) {
                for (var j = 1; j < DIFFERENCE_LEVELS_N; j++) {
                    if (i + j < nbMins) {
                        d = Math.abs(mins[i] - mins[i + j]);
                        distances[d] += 1;
                    }
                }
            }
            var bestDistance = -1;
            var bestValue = -1;
            for (var i = 0; i < curSamNb; i++) {
                var summed = 0;
                for (var j = -1 * delta; j <= delta; j++) {
                    if (i + j >= 0 && i + j < curSamNb) {
                        summed += distances[i + j];
                    }
                }
                if (summed === bestValue) {
                    if (i === 2 * bestDistance) {
                        bestDistance = i;
                    }
                }
                else if (summed > bestValue) {
                    bestValue = summed;
                    bestDistance = i;
                }
            }
            // averaging
            var distAvg = 0;
            var nbDists = 0;
            for (var j = -delta; j <= delta; j++) {
                if (bestDistance + j >= 0 && bestDistance + j < bufferLength) {
                    var nbDist = distances[bestDistance + j];
                    if (nbDist > 0) {
                        nbDists += nbDist;
                        distAvg += (bestDistance + j) * nbDist;
                    }
                }
            }
            // This is our mode distance.
            distAvg /= nbDists;
            // Continue the levels?
            if (curModeDistance > -1) {
                if (Math.abs(distAvg * 2 - curModeDistance) <= 2 * delta) {
                    // two consecutive similar mode distances : ok !
                    freq = sampleRate / (Math.pow(2, curLevel - 1) * curModeDistance);
                    break;
                }
            }
            // not similar, continue next level;
            curModeDistance = distAvg;
            curLevel++;
            if (curLevel >= MAX_FLWT_LEVELS || curSamNb < 2) {
                break;
            }
            //do not modify original audio buffer, make a copy buffer, if
            //downsampling is needed (only once).
            var newFloat32AudioBuffer = float32AudioBuffer.subarray(0);
            if (curSamNb === distances.length) {
                newFloat32AudioBuffer = new Float32Array(curSamNb / 2);
            }
            for (var i = 0; i < curSamNb / 2; i++) {
                newFloat32AudioBuffer[i] =
                    (float32AudioBuffer[2 * i] + float32AudioBuffer[2 * i + 1]) / 2;
            }
            float32AudioBuffer = newFloat32AudioBuffer;
            curSamNb /= 2;
        }
        return freq;
    };
}
exports.DynamicWavelet = DynamicWavelet;

},{}],5:[function(require,module,exports){
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
var DEFAULT_MACLEOD_PARAMS = {
    bufferSize: 1024,
    cutoff: 0.97,
    sampleRate: 44100,
};
function Macleod(params) {
    if (params === void 0) { params = {}; }
    var config = __assign(__assign({}, DEFAULT_MACLEOD_PARAMS), params);
    var bufferSize = config.bufferSize, cutoff = config.cutoff, sampleRate = config.sampleRate;
    /**
     * For performance reasons, peaks below this cutoff are not even considered.
     */
    var SMALL_CUTOFF = 0.5;
    /**
     * Pitch annotations below this threshold are considered invalid, they are
     * ignored.
     */
    var LOWER_PITCH_CUTOFF = 80;
    /**
     * Contains a normalized square difference function value for each delay
     * (tau).
     */
    var nsdf = new Float32Array(bufferSize);
    /**
     * Contains a sum of squares of the Buffer, for improving performance
     * (avoids redoing math in the normalized square difference function)
     */
    var squaredBufferSum = new Float32Array(bufferSize);
    /**
     * The x and y coordinate of the top of the curve (nsdf).
     */
    var turningPointX;
    var turningPointY;
    /**
     * A list with minimum and maximum values of the nsdf curve.
     */
    var maxPositions = [];
    /**
     * A list of estimates of the period of the signal (in samples).
     */
    var periodEstimates = [];
    /**
     * A list of estimates of the amplitudes corresponding with the period
     * estimates.
     */
    var ampEstimates = [];
    /**
     * Implements the normalized square difference function. See section 4 (and
     * the explanation before) in the MPM article. This calculation can be
     * optimized by using an FFT. The results should remain the same.
     */
    function normalizedSquareDifference(float32AudioBuffer) {
        var acf;
        var divisorM;
        squaredBufferSum[0] = float32AudioBuffer[0] * float32AudioBuffer[0];
        for (var i = 1; i < float32AudioBuffer.length; i += 1) {
            squaredBufferSum[i] =
                float32AudioBuffer[i] * float32AudioBuffer[i] + squaredBufferSum[i - 1];
        }
        for (var tau = 0; tau < float32AudioBuffer.length; tau++) {
            acf = 0;
            divisorM =
                squaredBufferSum[float32AudioBuffer.length - 1 - tau] +
                    squaredBufferSum[float32AudioBuffer.length - 1] -
                    squaredBufferSum[tau];
            for (var i = 0; i < float32AudioBuffer.length - tau; i++) {
                acf += float32AudioBuffer[i] * float32AudioBuffer[i + tau];
            }
            nsdf[tau] = (2 * acf) / divisorM;
        }
    }
    /**
     * Finds the x value corresponding with the peak of a parabola.
     * Interpolates between three consecutive points centered on tau.
     */
    function parabolicInterpolation(tau) {
        var nsdfa = nsdf[tau - 1], nsdfb = nsdf[tau], nsdfc = nsdf[tau + 1], bValue = tau, bottom = nsdfc + nsdfa - 2 * nsdfb;
        if (bottom === 0) {
            turningPointX = bValue;
            turningPointY = nsdfb;
        }
        else {
            var delta = nsdfa - nsdfc;
            turningPointX = bValue + delta / (2 * bottom);
            turningPointY = nsdfb - (delta * delta) / (8 * bottom);
        }
    }
    // Finds the highest value between each pair of positive zero crossings.
    function peakPicking() {
        var pos = 0;
        var curMaxPos = 0;
        // find the first negative zero crossing.
        while (pos < (nsdf.length - 1) / 3 && nsdf[pos] > 0) {
            pos++;
        }
        // loop over all the values below zero.
        while (pos < nsdf.length - 1 && nsdf[pos] <= 0) {
            pos++;
        }
        // can happen if output[0] is NAN
        if (pos == 0) {
            pos = 1;
        }
        while (pos < nsdf.length - 1) {
            if (nsdf[pos] > nsdf[pos - 1] && nsdf[pos] >= nsdf[pos + 1]) {
                if (curMaxPos == 0) {
                    // the first max (between zero crossings)
                    curMaxPos = pos;
                }
                else if (nsdf[pos] > nsdf[curMaxPos]) {
                    // a higher max (between the zero crossings)
                    curMaxPos = pos;
                }
            }
            pos++;
            // a negative zero crossing
            if (pos < nsdf.length - 1 && nsdf[pos] <= 0) {
                // if there was a maximum add it to the list of maxima
                if (curMaxPos > 0) {
                    maxPositions.push(curMaxPos);
                    curMaxPos = 0; // clear the maximum position, so we start
                    // looking for a new ones
                }
                while (pos < nsdf.length - 1 && nsdf[pos] <= 0) {
                    pos++; // loop over all the values below zero
                }
            }
        }
        if (curMaxPos > 0) {
            maxPositions.push(curMaxPos);
        }
    }
    return function Macleod(float32AudioBuffer) {
        // 0. Clear old results.
        var pitch;
        maxPositions = [];
        periodEstimates = [];
        ampEstimates = [];
        // 1. Calculute the normalized square difference for each Tau value.
        normalizedSquareDifference(float32AudioBuffer);
        // 2. Peak picking time: time to pick some peaks.
        peakPicking();
        var highestAmplitude = -Infinity;
        for (var i = 0; i < maxPositions.length; i++) {
            var tau = maxPositions[i];
            // make sure every annotation has a probability attached
            highestAmplitude = Math.max(highestAmplitude, nsdf[tau]);
            if (nsdf[tau] > SMALL_CUTOFF) {
                // calculates turningPointX and Y
                parabolicInterpolation(tau);
                // store the turning points
                ampEstimates.push(turningPointY);
                periodEstimates.push(turningPointX);
                // remember the highest amplitude
                highestAmplitude = Math.max(highestAmplitude, turningPointY);
            }
        }
        if (periodEstimates.length) {
            // use the overall maximum to calculate a cutoff.
            // The cutoff value is based on the highest value and a relative
            // threshold.
            var actualCutoff = cutoff * highestAmplitude;
            var periodIndex = 0;
            for (var i = 0; i < ampEstimates.length; i++) {
                if (ampEstimates[i] >= actualCutoff) {
                    periodIndex = i;
                    break;
                }
            }
            var period = periodEstimates[periodIndex], pitchEstimate = sampleRate / period;
            if (pitchEstimate > LOWER_PITCH_CUTOFF) {
                pitch = pitchEstimate;
            }
            else {
                pitch = -1;
            }
        }
        else {
            // no pitch detected.
            pitch = -1;
        }
        return {
            probability: highestAmplitude,
            freq: pitch,
        };
    };
}
exports.Macleod = Macleod;

},{}],6:[function(require,module,exports){
"use strict";
/*
  Copyright (C) 2003-2009 Paul Brossier <piem@aubio.org>
  This file is part of aubio.
  aubio is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.
  aubio is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.
  You should have received a copy of the GNU General Public License
  along with aubio.  If not, see <http://www.gnu.org/licenses/>.
*/
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
var DEFAULT_YIN_PARAMS = {
    threshold: 0.1,
    sampleRate: 44100,
    probabilityThreshold: 0.1,
};
function YIN(params) {
    if (params === void 0) { params = {}; }
    var config = __assign(__assign({}, DEFAULT_YIN_PARAMS), params);
    var threshold = config.threshold, sampleRate = config.sampleRate, probabilityThreshold = config.probabilityThreshold;
    return function YINDetector(float32AudioBuffer) {
        // Set buffer size to the highest power of two below the provided buffer's length.
        var bufferSize;
        for (bufferSize = 1; bufferSize < float32AudioBuffer.length; bufferSize *= 2)
            ;
        bufferSize /= 2;
        // Set up the yinBuffer as described in step one of the YIN paper.
        var yinBufferLength = bufferSize / 2;
        var yinBuffer = new Float32Array(yinBufferLength);
        var probability = 0, tau;
        // Compute the difference function as described in step 2 of the YIN paper.
        for (var t = 0; t < yinBufferLength; t++) {
            yinBuffer[t] = 0;
        }
        for (var t = 1; t < yinBufferLength; t++) {
            for (var i = 0; i < yinBufferLength; i++) {
                var delta = float32AudioBuffer[i] - float32AudioBuffer[i + t];
                yinBuffer[t] += delta * delta;
            }
        }
        // Compute the cumulative mean normalized difference as described in step 3 of the paper.
        yinBuffer[0] = 1;
        yinBuffer[1] = 1;
        var runningSum = 0;
        for (var t = 1; t < yinBufferLength; t++) {
            runningSum += yinBuffer[t];
            yinBuffer[t] *= t / runningSum;
        }
        // Compute the absolute threshold as described in step 4 of the paper.
        // Since the first two positions in the array are 1,
        // we can start at the third position.
        for (tau = 2; tau < yinBufferLength; tau++) {
            if (yinBuffer[tau] < threshold) {
                while (tau + 1 < yinBufferLength && yinBuffer[tau + 1] < yinBuffer[tau]) {
                    tau++;
                }
                // found tau, exit loop and return
                // store the probability
                // From the YIN paper: The threshold determines the list of
                // candidates admitted to the set, and can be interpreted as the
                // proportion of aperiodic power tolerated
                // within a periodic signal.
                //
                // Since we want the periodicity and and not aperiodicity:
                // periodicity = 1 - aperiodicity
                probability = 1 - yinBuffer[tau];
                break;
            }
        }
        // if no pitch found, return null.
        if (tau === yinBufferLength || yinBuffer[tau] >= threshold) {
            return null;
        }
        // If probability too low, return -1.
        if (probability < probabilityThreshold) {
            return null;
        }
        /**
         * Implements step 5 of the AUBIO_YIN paper. It refines the estimated tau
         * value using parabolic interpolation. This is needed to detect higher
         * frequencies more precisely. See http://fizyka.umk.pl/nrbook/c10-2.pdf and
         * for more background
         * http://fedc.wiwi.hu-berlin.de/xplore/tutorials/xegbohtmlnode62.html
         */
        var betterTau, x0, x2;
        if (tau < 1) {
            x0 = tau;
        }
        else {
            x0 = tau - 1;
        }
        if (tau + 1 < yinBufferLength) {
            x2 = tau + 1;
        }
        else {
            x2 = tau;
        }
        if (x0 === tau) {
            if (yinBuffer[tau] <= yinBuffer[x2]) {
                betterTau = tau;
            }
            else {
                betterTau = x2;
            }
        }
        else if (x2 === tau) {
            if (yinBuffer[tau] <= yinBuffer[x0]) {
                betterTau = tau;
            }
            else {
                betterTau = x0;
            }
        }
        else {
            var s0 = yinBuffer[x0];
            var s1 = yinBuffer[tau];
            var s2 = yinBuffer[x2];
            // fixed AUBIO implementation, thanks to Karl Helgason:
            // (2.0f * s1 - s2 - s0) was incorrectly multiplied with -1
            betterTau = tau + (s2 - s0) / (2 * (2 * s1 - s2 - s0));
        }
        return sampleRate / betterTau;
    };
}
exports.YIN = YIN;

},{}],7:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var yin_1 = require("./detectors/yin");
exports.YIN = yin_1.YIN;
var amdf_1 = require("./detectors/amdf");
exports.AMDF = amdf_1.AMDF;
var acf2plus_1 = require("./detectors/acf2plus");
exports.ACF2PLUS = acf2plus_1.ACF2PLUS;
var dynamic_wavelet_1 = require("./detectors/dynamic_wavelet");
exports.DynamicWavelet = dynamic_wavelet_1.DynamicWavelet;
var macleod_1 = require("./detectors/macleod");
exports.Macleod = macleod_1.Macleod;
var frequencies_1 = require("./tools/frequencies");
exports.default = {
    YIN: yin_1.YIN,
    AMDF: amdf_1.AMDF,
    ACF2PLUS: acf2plus_1.ACF2PLUS,
    DynamicWavelet: dynamic_wavelet_1.DynamicWavelet,
    Macleod: macleod_1.Macleod,
    frequencies: frequencies_1.frequencies,
};

},{"./detectors/acf2plus":2,"./detectors/amdf":3,"./detectors/dynamic_wavelet":4,"./detectors/macleod":5,"./detectors/yin":6,"./tools/frequencies":8}],8:[function(require,module,exports){
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_FREQUENCIES_PARAMS = {
    tempo: 120,
    quantization: 4,
    sampleRate: 44100,
};
function pitchConsensus(detectors, chunk) {
    var pitches = detectors
        .map(function (fn) { return fn(chunk); })
        .filter(function (value) { return value !== null; })
        .sort(function (a, b) { return a - b; });
    // In the case of one pitch, return it.
    if (pitches.length === 1) {
        return pitches[0];
        // In the case of two pitches, return the geometric mean if they
        // are close to each other, and the lower pitch otherwise.
    }
    else if (pitches.length === 2) {
        var first = pitches[0], second = pitches[1];
        return first * 2 > second ? Math.sqrt(first * second) : first;
        // In the case of three or more pitches, filter away the extremes
        // if they are very extreme, then take the geometric mean.
    }
    else {
        var first = pitches[0];
        var second = pitches[1];
        var secondToLast = pitches[pitches.length - 2];
        var last = pitches[pitches.length - 1];
        var filtered1 = first * 2 > second ? pitches : pitches.slice(1);
        var filtered2 = secondToLast * 2 > last ? filtered1 : filtered1.slice(0, -1);
        return Math.pow(filtered2.reduce(function (t, p) { return t * p; }, 1), 1 / filtered2.length);
    }
}
function frequencies(detector, float32AudioBuffer, options) {
    if (options === void 0) { options = {}; }
    var config = __assign(__assign({}, exports.DEFAULT_FREQUENCIES_PARAMS), options);
    var tempo = config.tempo, quantization = config.quantization, sampleRate = config.sampleRate;
    var bufferLength = float32AudioBuffer.length;
    var chunkSize = Math.round((sampleRate * 60) / (quantization * tempo));
    var getPitch;
    if (Array.isArray(detector)) {
        getPitch = pitchConsensus.bind(null, detector);
    }
    else {
        getPitch = detector;
    }
    var pitches = [];
    for (var i = 0, max = bufferLength - chunkSize; i <= max; i += chunkSize) {
        var chunk = float32AudioBuffer.slice(i, i + chunkSize);
        var pitch = getPitch(chunk);
        pitches.push(pitch);
    }
    return pitches;
}
exports.frequencies = frequencies;

},{}]},{},[1]);
