import os
import csv
import re
import logging
import uuid
from datetime import datetime

from dateutil.parser import parse
from flask import Flask, render_template, send_from_directory, jsonify

DATA_DIR = os.path.expanduser('./data')
CUSTOM_MUSIC_DIR = os.path.join(DATA_DIR, 'music')
COMMON_MUSIC_DIR = './music'
RT_SCORE_LOG = os.path.join(DATA_DIR, 'rt_scores.log')
FIELDNAMES = ['timestamp', 'path', 'score', 'qpm', 'profile']
PROFILES_FN = os.path.join(DATA_DIR, 'profiles.txt')

ABC_EXT = '.abc'
PLAYLIST_EXT = '.pls'

app = Flask(__name__, static_url_path='')

title = 'ABC Sightreader'

logging.basicConfig()
logging.root.setLevel(logging.NOTSET)
logging.basicConfig(level=logging.NOTSET)
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

@app.route('/')
def index():
    files = set()
    for music_dir in (CUSTOM_MUSIC_DIR, COMMON_MUSIC_DIR):
        if not os.path.isdir(music_dir):
            continue
        for fn in os.listdir(music_dir):
            if fn.endswith(ABC_EXT) or fn.endswith(PLAYLIST_EXT):
                files.add(fn)
    profiles = [('', 'Default'), ('new', 'Create new profile')]
    if os.path.isfile(PROFILES_FN):
        with open(PROFILES_FN) as fin:
            for line in fin.readlines():
                line = line.strip()
                if not line:
                    continue
                profiles.append((line, line))
    files = list(files)
    files.sort()
    return render_template('index.html', title=title, uuid=uuid.uuid4(), files=files, profiles=profiles)

@app.route('/js/<path:path>')
def send_js(path):
    return send_from_directory('js', path)

@app.route('/css/<path:path>')
def send_css(path):
    return send_from_directory('css', path)

@app.route('/abc/full/<path:path>'+ABC_EXT)
def send_abc_full(path):
    fn = path + ABC_EXT
    for music_dir in (CUSTOM_MUSIC_DIR, COMMON_MUSIC_DIR):
        fqfn = os.path.join(music_dir, fn)
        if not os.path.isfile(fqfn):
            continue
        with open(fqfn) as fin:
            return fin.read()

@app.route('/profile/save/<path:path>')
def save_profile(path):
    with open(PROFILES_FN, 'a') as fout:
        name = path.strip().lower()
        name = re.sub(r'[^a-z0-9]+', '', name)
        if not name:
            return jsonify(0) # Failure.
        fout.write(name+'\n')
    return jsonify(1) # Success.

@app.route('/abc/single/<path:path>'+ABC_EXT)
def send_abc_single(path):
    """
    Returns the ABC meant for single-line rendering, so excludes all most information fields.
    http://abcnotation.com/wiki/abc:standard:v2.1#information_fields

    UPDATE 04/12/2021: No longer rendering single-line, so join notes with '\n'
    """
    fn = path + ABC_EXT
    headers = []
    notes = []
    for music_dir in (CUSTOM_MUSIC_DIR, COMMON_MUSIC_DIR):
        fqfn = os.path.join(music_dir, fn)
        logger.debug('Checking file %s', fqfn)
        if not os.path.isfile(fqfn):
            continue
        with open(fqfn) as fin:
            for line in fin.readlines():
                line = line.strip()
                if not line or line[0] == '%':
                    logger.debug('Ignoring comment: %s', line)
                    continue
                if len(line) >= 2 and line[1] == ':' and line[0].isalpha():
                    if line[0].upper() in {'T', 'C', 'Z', 'S', 'N', 'G', 'O', 'H', 'I', 'P', 'W', 'F', 'B'}:
                        # Ignore meta tags like title/author/composer/etc.
                        # We don't want these heightening the render.
                        logger.debug('Ignoring header: %s', line)
                        continue
                    logger.debug('Keeping header: %s', line)
                    headers.append(line)
                else:
                    logger.debug('Keeping notes: %s', line)
                    notes.append(line)
        break
    data = '\n'.join(headers) + '\n' + ('\n'.join(notes))
    return data

@app.route('/playlist/<path:path>'+PLAYLIST_EXT)
def send_playlist(path):
    fn = path + PLAYLIST_EXT
    files = []
    for music_dir in (CUSTOM_MUSIC_DIR, COMMON_MUSIC_DIR):
        fqfn = os.path.join(music_dir, fn)
        print('Checking %s' % fqfn)
        if not os.path.isfile(fqfn):
            continue
        with open(fqfn) as fin:
            for line in fin.readlines():
                line = line.strip()
                if not line or line[0] == '#':
                    continue
                files.append(line)
        break
    return jsonify(files)

@app.route('/fonts/<path:path>')
def send_fonts(path):
    return send_from_directory('fonts', path)

@app.route('/img/<path:path>')
def send_img(path):
    return send_from_directory('img', path)

@app.route('/model/<path:path>')
def send_model(path):
    return send_from_directory('model', path)

@app.route('/score/set/<path:path>/<int:score>/<int:qpm>/', defaults={'profile': ''})
@app.route('/score/set/<path:path>/<int:score>/<int:qpm>/<string:profile>')
def record_score(path, score, qpm, profile):
    write_header = not os.path.isfile(RT_SCORE_LOG)
    with open(RT_SCORE_LOG, 'a') as fout:
        if write_header:
            fout.write(','.join(FIELDNAMES) + '\n')
        now = datetime.now()
        fout.write(f'{now},{path},{score},{qpm},{profile}\n')
    return 'ok'

@app.route('/score/get/<path:path>/<int:qpm>/', defaults={'profile': ''})
@app.route('/score/get/<path:path>/<int:qpm>/<string:profile>')
def send_score_stats(path, qpm, profile):
    """
    Retrieves score statistics for the given path and beats-per-minute.
    """
    target_key = (path, qpm, profile)
    scores = []
    with open(RT_SCORE_LOG, 'r') as fin:
        reader = csv.DictReader(fin)
        for line in reader:
            key = line['path'], int(line['qpm']), line.get('profile', '')
            if key != target_key:
                continue
            ts = parse(line['timestamp'])
            score = int(float(line['score']))
            scores.append((ts, score))
    min_score = None
    max_score = None
    mean_score = None
    most_recent = sorted(scores, reverse=True)[:10]
    if most_recent:
        mean_score = int(round(sum(_score for _ts, _score in most_recent)/float(len(most_recent))))
        min_score = min(_score for _ts, _score in most_recent)
        max_score = max(_score for _ts, _score in most_recent)
    return jsonify({
        'mean_score': mean_score,
        'min_score': min_score,
        'max_score': max_score,
        'most_recent_scores': [_score for _ts, _score in most_recent]
    })

if __name__ == "__main__":
    app.run(host='0.0.0.0', debug=True)
