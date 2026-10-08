
import io, sys, json
sys.path.insert(0, '/jc')
BOOT_ERROR = None
try:
    import jesun
    _out = io.StringIO()
    interp = jesun.Interpreter(stdout=_out, stdin=io.StringIO())
    jesun.run_source(open('/jc/realms.jc', encoding='utf-8').read(), interp)
    _OUTV = interp.global_env.vars['OUT']
except Exception as e:
    BOOT_ERROR = 'boot: ' + str(e)

def _snap():
    try:
        o = _OUTV
        return json.dumps({'ok': True, 'dl': o['dl'], 'hud': o['hud'], 'msgs': o['msgs'], 'over': o['over'], 'score': o['score'], 'snd': o['snd']})
    except Exception as e:
        return json.dumps({'ok': False, 'error': 'snap: ' + str(e)})

def start_game(seed, diff=2):
    try:
        jesun.run_source('seed_game with %d' % int(seed), interp)
        jesun.run_source('set_difficulty with %d' % int(diff), interp)
        jesun.run_source('tick', interp)
    except Exception as e:
        return json.dumps({'ok': False, 'error': 'seed: ' + str(e)})
    return _snap()

def pump(keys):
    try:
        for k in keys:
            jesun.run_source('press with "%s"' % k, interp)
        jesun.run_source('tick', interp)
    except Exception as e:
        return json.dumps({'ok': False, 'error': 'tick: ' + str(e)})
    return _snap()
