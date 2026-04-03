/* ── Example 1: Prefix KV cache toggle ─────────────────── */

function kvToggle(cached) {
    var btns = document.querySelectorAll('#viz-kv .viz-btn');
    btns[0].classList.toggle('active', !cached);
    btns[1].classList.toggle('active', cached);

    var prefix = document.getElementById('kv-b-prefix');
    var timeB = document.getElementById('kv-time-b');
    var note = document.getElementById('kv-note');

    if (cached) {
        prefix.className = 'kv-seg kv-cached';
        prefix.textContent = 'cached (skipped)';
        timeB.textContent = '35 ms';
        timeB.className = 'kv-time fast';
        note.textContent = 'Request B reuses the prefix KV from A. Only the emissions query tokens are computed.';
    } else {
        prefix.className = 'kv-seg kv-prefix';
        prefix.textContent = 'system + 3 passages';
        timeB.textContent = '120 ms';
        timeB.className = 'kv-time';
        note.textContent = 'Both requests compute the full KV cache from scratch, including the identical prefix.';
    }
}

/* ── Example 2: Speculative decoding step-through ──────── */

var specState = { step: 0 };
var specTokens = [
    { final: 'The',   draft: 'The',    match: true  },
    { final: 'model', draft: 'model',  match: true  },
    { final: 'uses',  draft: 'uses',   match: true  },
    { final: 'a',     draft: 'an',     match: false },
    { final: 'cache', draft: 'cache',  match: true  },
    { final: 'to',    draft: 'to',     match: true  },
    { final: 'store', draft: 'save',   match: false },
    { final: 'state', draft: 'state',  match: true  }
];
var specSteps = [
    { desc: 'Press "Next step" to see the draft/verify cycle.', action: 'init' },
    { desc: 'Draft model generates 4 tokens autoregressively (fast, small model): "The model uses an"', action: 'draft1' },
    { desc: 'Target runs one forward pass on all 4 proposals. Accepts 3, rejects "an" \u2192 corrects to "a". Tokens after rejection are discarded.', action: 'verify1' },
    { desc: 'Draft proposes 4 more from the corrected position: "cache to save state"', action: 'draft2' },
    { desc: 'Target verifies in one pass: "cache" \u2713, "to" \u2713, "save" \u2717 \u2192 corrected to "store". "state" discarded.', action: 'verify2' },
    { desc: 'Draft proposes from corrected position: "state"', action: 'draft3' },
    { desc: 'Target accepts "state" \u2713. Sequence complete. 8 tokens in 3 verification passes instead of 8.', action: 'verify3' }
];

function specRender() {
    var container = document.getElementById('spec-tokens');
    container.innerHTML = '';
    for (var i = 0; i < specTokens.length; i++) {
        var t = specTokens[i];
        var div = document.createElement('div');
        div.className = 'spec-tok ' + (t.state || 'empty');
        div.textContent = t.display || '';
        container.appendChild(div);
    }
}

function specReset() {
    specState.step = 0;
    for (var i = 0; i < specTokens.length; i++) {
        specTokens[i].state = 'empty';
        specTokens[i].display = '';
    }
    specRender();
    document.getElementById('spec-info').textContent = specSteps[0].desc;
}

function specStep() {
    if (specState.step >= specSteps.length - 1) return;
    specState.step++;
    var s = specSteps[specState.step];
    document.getElementById('spec-info').textContent = s.desc;

    if (s.action === 'draft1') {
        for (var i = 0; i < 4; i++) {
            specTokens[i].state = 'draft';
            specTokens[i].display = specTokens[i].draft;
        }
    } else if (s.action === 'verify1') {
        specTokens[0].state = 'accepted'; specTokens[0].display = specTokens[0].final;
        specTokens[1].state = 'accepted'; specTokens[1].display = specTokens[1].final;
        specTokens[2].state = 'accepted'; specTokens[2].display = specTokens[2].final;
        specTokens[3].state = 'rejected'; specTokens[3].display = specTokens[3].draft;
        setTimeout(function() {
            specTokens[3].state = 'corrected';
            specTokens[3].display = specTokens[3].final;
            specRender();
        }, 500);
    } else if (s.action === 'draft2') {
        specTokens[3].state = 'accepted'; specTokens[3].display = specTokens[3].final;
        for (var j = 4; j < 8; j++) {
            specTokens[j].state = 'draft';
            specTokens[j].display = specTokens[j].draft;
        }
    } else if (s.action === 'verify2') {
        specTokens[4].state = 'accepted'; specTokens[4].display = specTokens[4].final;
        specTokens[5].state = 'accepted'; specTokens[5].display = specTokens[5].final;
        specTokens[6].state = 'rejected'; specTokens[6].display = specTokens[6].draft;
        specTokens[7].state = 'empty'; specTokens[7].display = '';
        setTimeout(function() {
            specTokens[6].state = 'corrected';
            specTokens[6].display = specTokens[6].final;
            specRender();
        }, 500);
    } else if (s.action === 'draft3') {
        specTokens[6].state = 'accepted'; specTokens[6].display = specTokens[6].final;
        specTokens[7].state = 'draft'; specTokens[7].display = specTokens[7].draft;
    } else if (s.action === 'verify3') {
        specTokens[7].state = 'accepted'; specTokens[7].display = specTokens[7].final;
    }

    specRender();
}

specReset();

/* ── Example 4: Prompt reduction slider ────────────────── */

var promptData = [
    { chunks: 1, tokens: 600,  ttft: 50,   rel: 45  },
    { chunks: 2, tokens: 1200, ttft: 95,   rel: 72  },
    { chunks: 3, tokens: 1800, ttft: 140,  rel: 88  },
    { chunks: 4, tokens: 2400, ttft: 180,  rel: 92  },
    { chunks: 5, tokens: 3000, ttft: 230,  rel: 94  },
    { chunks: 6, tokens: 3600, ttft: 285,  rel: 95  },
    { chunks: 7, tokens: 4200, ttft: 350,  rel: 96  },
    { chunks: 8, tokens: 4800, ttft: 420,  rel: 96  }
];
var promptNotes = [
    'At 1 chunk: fast, but likely missing critical evidence.',
    'At 2 chunks: better coverage, still quick prefill.',
    'At 3 chunks: good balance point for many workloads.',
    'At 4 chunks: solid coverage with moderate latency.',
    'At 5 chunks: diminishing relevance gains. TTFT starting to climb.',
    'At 6 chunks: marginal relevance improvement. Prefill getting expensive.',
    'At 7 chunks: almost no new information. Latency cost is real.',
    'At 8 chunks: maximum context. TTFT is high and most of it is redundant.'
];

function promptUpdate() {
    var n = parseInt(document.getElementById('prompt-chunks').value);
    var d = promptData[n - 1];
    document.getElementById('prompt-chunks-val').textContent = n;
    document.getElementById('prompt-tokens-val').textContent = '~' + d.tokens + ' tokens';
    document.getElementById('prompt-ttft-val').textContent = '~' + d.ttft + ' ms';
    document.getElementById('prompt-rel-val').textContent = d.rel + '%';

    document.getElementById('prompt-size-fill').style.width = (d.tokens / 4800 * 100) + '%';
    document.getElementById('prompt-ttft-fill').style.width = (d.ttft / 420 * 100) + '%';
    document.getElementById('prompt-rel-fill').style.width = d.rel + '%';
    document.getElementById('prompt-note').textContent = promptNotes[n - 1];
}

promptUpdate();

/* ── Example 7: Quantization toggle ────────────────────── */

var quantConfig = {
    fp16: { mem: 100, memLabel: '14 GB', tput: 40, tputLabel: '1\u00d7',   quality: 5, qLabel: 'Baseline',             note: 'FP16: full precision baseline. No quality tradeoff, but highest memory cost.' },
    int8: { mem: 50,  memLabel: '7 GB',  tput: 70, tputLabel: '~1.7\u00d7', quality: 4, qLabel: 'Minimal degradation',  note: 'INT8: half the memory, near-baseline quality for most tasks. Usually the safe first step.' },
    int4: { mem: 25,  memLabel: '3.5 GB', tput: 90, tputLabel: '~2.4\u00d7', quality: 2, qLabel: 'Task-dependent',       note: 'INT4: aggressive compression. Works well for some tasks, measurably worse for others. Always verify.' }
};

function quantSet(mode) {
    var btns = document.querySelectorAll('#viz-quant .viz-btn');
    for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
    var labels = { fp16: 0, int8: 1, int4: 2 };
    btns[labels[mode]].classList.add('active');

    var c = quantConfig[mode];
    document.getElementById('quant-mem-fill').style.width = c.mem + '%';
    document.getElementById('quant-mem-fill').textContent = c.memLabel;
    document.getElementById('quant-tput-fill').style.width = c.tput + '%';
    document.getElementById('quant-tput-fill').textContent = c.tputLabel;

    var dotsHtml = '';
    for (var j = 0; j < 5; j++) {
        var cls = j < c.quality ? (c.quality <= 3 ? 'on warn' : 'on') : '';
        dotsHtml += '<div class="quant-quality-dot ' + cls + '"></div>';
    }
    document.getElementById('quant-dots').innerHTML = dotsHtml;
    document.getElementById('quant-quality-label').textContent = c.qLabel;
    document.getElementById('quant-note').textContent = c.note;
}

quantSet('fp16');
