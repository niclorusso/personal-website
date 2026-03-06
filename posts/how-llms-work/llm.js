(function () {
  'use strict';

  // ── Tokenizer demo ────────────────────────────────────────────────

  // GPT-style tokenizers keep common words/subwords whole. This lookup
  // covers the ~1500 most frequent English tokens so the demo feels
  // realistic. Words not in the list get split into known subword
  // pieces, with single-character fallback.

  var VOCAB = (
    'the of and to a in is that it for was on are as with his they be ' +
    'at one have this from or had by not but what all were when we there ' +
    'can an your which their said if do will each about how up out them ' +
    'then she many some so these would other into has her two like him ' +
    'see time could no make than first been its who now people my made ' +
    'over did down only way find use may water long little very after ' +
    'words called just where most know get through back much before also ' +
    'around another came come work three word must because does part even ' +
    'place well such here take why things help put years different away ' +
    'again off went old number great tell men say small every found still ' +
    'between name should home big give air line set own under read last ' +
    'never us left end along while might next sound below saw something ' +
    'thought both few those always looked show large often together asked ' +
    'house don world going want school important until form food keep ' +
    'children feet land side without boy once animal life enough took ' +
    'sometimes four head above kind began almost live page got earth need ' +
    'far hand high year mother light country father let night following ' +
    'picture being study second soon story since white ever paper hard ' +
    'near sentence better best across during today others however sure ' +
    'thing person happened whole measure remember early money young ' +
    'morning start open body seems walk knew later talk became real ' +
    'heard already nothing among given point taken group right using ' +
    'bring free became gone felt making stand full close order room ' +
    'anything against field days himself looking became trying ' +
    'running wanted morning says really change area family face door ' +
    'voice love power problem human building looking inside half lost ' +
    'game answer move question possible state working play keep special ' +
    'talk run city book kind water light thought try five eyes girl ' +
    'less getting table across everything town car heart mind enough ' +
    'become case seems ready room food past believe hold true force ' +
    'level feel church meet seems plan return fact clear age anything ' +
    'figure road system strong better idea speak rather front matter ' +
    'lead figure least type class white black art experience north ' +
    'feel rest main report really month cut learn quite personal close ' +
    'seem clear leave decision deep include kind table dark build step ' +
    'common wrong political produce hold economic reach rest south act ' +
    'help bring okay yes no not just more than very also still only ' +
    'even back good new first last long great little own old right big ' +
    'high small different large next early young important few public ' +
    'bad same able call use program government data information system ' +
    'company number did war general history social tax research report ' +
    'money market price cost rate pay service national international ' +
    'political economic business financial security military education ' +
    'health law court police office president congress member party ' +
    'election campaign official news media press technology computer ' +
    'software science university college student professor doctor ' +
    'hospital patient medical drug disease treatment test result study ' +
    'research project team manager director department agency board ' +
    'commission committee council organization association institute ' +
    'am is are was were be been being have has had having do does did ' +
    'doing will would shall should may might can could must need dare ' +
    'i me my mine myself we us our ours ourselves you your yours ' +
    'yourself yourselves he him his himself she her hers herself it ' +
    'its itself they them their theirs themselves what which who whom ' +
    'whose this that these those here there where when how why all any ' +
    'both each few more most other some such nor so and but or yet ' +
    'because although since while if unless until before after though ' +
    'mom dad father mother brother sister son daughter baby family ' +
    'friend friend wife husband child children kid kids man woman ' +
    'boy girl people person human life death love hate happy sad ' +
    'angry afraid hurt sick tired hungry cold hot nice mean kind ' +
    'smart funny real actually probably maybe might seems going okay ' +
    'hey hi hello yeah sure thanks sorry please help stop wait look ' +
    'see hear feel think know want need like love hate get got give ' +
    'take make come go say tell ask try start begin work play eat ' +
    'drink sleep wake sit stand walk run move turn open close read ' +
    'write learn teach show watch listen talk speak meet leave stay ' +
    'live die buy sell pay spend save build break fix clean cook ' +
    'drive ride fly swim sing dance fight win lose hold catch throw ' +
    'pull push carry drop pick choose decide forget remember believe ' +
    'hope wish dream agree follow lead join share explain describe ' +
    'happen wonder enjoy worry care bear wear grow fall rise hang ' +
    'lay lie hit cut kill fill cover reach pass touch cross check ' +
    'count beat mark raise draw deal prove burn discover suppose ' +
    'chat gpt chatgpt tokens token model models language machine ' +
    'learning artificial intelligence neural network training data ' +
    'input output predict prediction word words sentence text ' +
    'meaning context attention parameter parameters weight weights ' +
    'layer layers embedding vector probability distribution sample ' +
    'temperature generate generation prompt response ' +
    'improve improvement improvements performance beautiful ' +
    'wonderful terrible horrible interesting understand understanding ' +
    'information communication relationship environment development ' +
    'government opportunity experience professional responsibility ' +
    'conversation independent unfortunately representative ' +
    'international organization administration investigation ' +
    'specifically particularly absolutely everything something ' +
    'nothing anything everyone someone anyone nobody somebody ' +
    'everybody whatever whenever wherever however whenever although ' +
    'restaurant conversation television interview magazine newspaper ' +
    'photograph apartment education situation application connection ' +
    'traditional additional collection discussion permission condition ' +
    'attention direction protection production operation position ' +
    'population generation competition revolution suggestion opinion ' +
    'expression impression imagination combination celebration ' +
    'description introduction explanation presentation examination ' +
    'recommendation consideration implementation transformation ' +
    'amazing awesome incredible fantastic brilliant excellent ' +
    'dangerous difficult different important necessary possible ' +
    'available comfortable reasonable responsible successful ' +
    'completely definitely especially finally obviously seriously ' +
    'probably certainly basically apparently literally generally ' +
    'immediately recently frequently eventually occasionally usually ' +
    'together without between through against another because ' +
    'during before after until behind beyond within above below ' +
    'inside outside around toward forward backward upward downward ' +
    'working walking talking thinking looking making taking giving ' +
    'coming going saying telling asking helping playing reading ' +
    'writing living moving starting opening running using bringing ' +
    'keeping trying showing learning building calling feeling ' +
    'leaving meeting sitting standing holding turning following ' +
    'losing winning creating knowing believing changing growing ' +
    'falling happening becoming remaining continuing beginning ' +
    'including considering providing offering spending watching ' +
    'listening speaking breaking carrying fighting catching flying ' +
    'bought brought caught taught thought fought sought ' +
    'written spoken broken chosen frozen taken given driven ' +
    'known shown grown thrown drawn begun drunk sung swum ' +
    'myself yourself himself herself itself ourselves themselves ' +
    'heck dude cool weird funny stuff totally super extra mega ultra'
  ).split(' ').filter(function(w) { return w.length > 0; });

  var VOCAB_SET = {};
  VOCAB.forEach(function (w) { VOCAB_SET[w] = true; });

  var SUBWORDS = (
    'ing ed ly er est tion sion ment ness ful less able ible ous ious ' +
    'al ial ent ant ive ative ity ty ment ence ance ism ist ize ise ' +
    'un re pre dis mis over under out non anti inter super trans ' +
    'ment ness ful less ing ed er est ly al ial ous ious ent ant ' +
    'ive ity ty ence ance ism ist ize ise ate ble ling ting ding ' +
    'ning ring king sing ger ner ter der ler mer ber per ked ged ' +
    'ned ted ded sed zed ced ved ped bed med wed led red ied yed ' +
    'ated ited uted ened ined oned ared ered ired ured ized ised ' +
    'ting ding ning ring sing king ling ming ping bing gging nning ' +
    'tting pping dding lling mming zzing ssing pping fing ving wing ' +
    'ther ture sure ness ment able ible ful less ous ious tion sion ' +
    'ence ance ally illy ully erly arly ably ibly ously iously ' +
    'ness ment ful less ive ity ty ence ance ism ist ize ise ate ' +
    'ical ular ular ance ence ible able'
  ).split(' ').filter(function(w) { return w.length > 0; });

  var SUBWORD_SET = {};
  SUBWORDS.forEach(function (w) { SUBWORD_SET[w] = true; });

  var TOKEN_COLORS = [
    '#dbeafe','#dcfce7','#fef9c3','#fce7f3','#e0e7ff',
    '#ccfbf1','#fde68a','#fbcfe8','#c7d2fe','#a7f3d0',
    '#bfdbfe','#d9f99d','#fed7aa','#e9d5ff','#99f6e4'
  ];

  function splitUnknown(word) {
    // Try to split into stem + known suffix
    for (var suffLen = Math.min(6, word.length - 1); suffLen >= 2; suffLen--) {
      var stem = word.substring(0, word.length - suffLen);
      var suffix = word.substring(word.length - suffLen);
      if (SUBWORD_SET[suffix] && stem.length >= 2) {
        if (VOCAB_SET[stem]) return [stem, suffix];
        for (var s2 = Math.min(6, stem.length - 1); s2 >= 2; s2--) {
          var pre = stem.substring(0, stem.length - s2);
          var mid = stem.substring(stem.length - s2);
          if (pre.length >= 2 && (VOCAB_SET[pre] || SUBWORD_SET[mid])) {
            return [pre, mid, suffix];
          }
        }
        // stem is unknown, chop it then add suffix
        var stemPieces = chunkWord(stem);
        stemPieces.push(suffix);
        return stemPieces;
      }
    }
    // Try known prefix + rest
    for (var preLen = Math.min(5, word.length - 2); preLen >= 2; preLen--) {
      var prefix = word.substring(0, preLen);
      var rest = word.substring(preLen);
      if (SUBWORD_SET[prefix] || VOCAB_SET[prefix]) {
        if (VOCAB_SET[rest] || SUBWORD_SET[rest]) return [prefix, rest];
        var restPieces = chunkWord(rest);
        return [prefix].concat(restPieces);
      }
    }
    // Nothing matched, split into small chunks (simulates byte-level BPE fallback)
    return chunkWord(word);
  }

  function chunkWord(word) {
    if (word.length <= 4) return [word];
    var pieces = [];
    var i = 0;
    while (i < word.length) {
      var remaining = word.length - i;
      // Try to grab known vocab/subword pieces first
      var grabbed = false;
      for (var tryLen = Math.min(6, remaining); tryLen >= 2; tryLen--) {
        var slice = word.substring(i, i + tryLen);
        if (VOCAB_SET[slice] || SUBWORD_SET[slice]) {
          pieces.push(slice);
          i += tryLen;
          grabbed = true;
          break;
        }
      }
      if (!grabbed) {
        var chunkSize = remaining <= 5 ? remaining : 3;
        pieces.push(word.substring(i, i + chunkSize));
        i += chunkSize;
      }
    }
    return pieces;
  }

  function simpleTokenize(text) {
    if (!text) return [];
    var tokens = [];
    // Split on word boundaries, keeping whitespace and punctuation as separate tokens
    var parts = text.match(/[a-zA-Z']+|[0-9]+|[^a-zA-Z0-9]/g) || [];
    for (var p = 0; p < parts.length; p++) {
      var part = parts[p];
      if (/^[a-zA-Z']+$/.test(part)) {
        var lower = part.toLowerCase();
        if (VOCAB_SET[lower]) {
          tokens.push(part);
        } else {
          var pieces = splitUnknown(lower);
          var ci = 0;
          for (var pi = 0; pi < pieces.length; pi++) {
            tokens.push(part.substring(ci, ci + pieces[pi].length));
            ci += pieces[pi].length;
          }
        }
      } else {
        tokens.push(part);
      }
    }
    return tokens;
  }

  function fakeTokenId(text) {
    var h = 0;
    for (var i = 0; i < text.length; i++) {
      h = ((h << 5) - h + text.charCodeAt(i)) | 0;
    }
    return Math.abs(h) % 100000;
  }

  function renderTokenizer() {
    var input = document.getElementById('tokenInput');
    var output = document.getElementById('tokenOutput');
    var stats = document.getElementById('tokenStats');
    if (!input || !output) return;

    function update() {
      var tokens = simpleTokenize(input.value);
      output.innerHTML = '';
      tokens.forEach(function (t, idx) {
        var span = document.createElement('span');
        span.className = 'token-chip';
        span.style.background = TOKEN_COLORS[idx % TOKEN_COLORS.length];
        span.textContent = t;
        span.title = 'token ' + fakeTokenId(t.toLowerCase());
        output.appendChild(span);
      });
      if (stats) {
        var chars = input.value.length;
        var ratio = chars > 0 ? (chars / tokens.length).toFixed(1) : '—';
        stats.textContent = tokens.length + ' tokens from ' + chars + ' characters (~' + ratio + ' chars per token)';
      }
    }

    input.addEventListener('input', update);
    update();
  }

  // ── Embeddings demo ───────────────────────────────────────────────

  var WORD_VECS = {
    king:    [0.72, 0.68], queen:  [0.75, 0.58], prince: [0.70, 0.62],
    man:     [0.65, 0.72], woman:  [0.67, 0.55], boy:    [0.60, 0.70],
    girl:    [0.62, 0.52], cat:    [0.30, 0.40], dog:    [0.32, 0.45],
    kitten:  [0.28, 0.38], puppy:  [0.30, 0.47], fish:   [0.25, 0.30],
    bird:    [0.22, 0.42], paris:  [0.50, 0.22], france: [0.52, 0.20],
    london:  [0.55, 0.25], england:[0.57, 0.22], berlin: [0.48, 0.27],
    germany: [0.50, 0.25], rome:   [0.46, 0.23], italy:  [0.48, 0.21],
    happy:   [0.80, 0.35], sad:    [0.82, 0.28], joy:    [0.78, 0.37],
    anger:   [0.85, 0.22], love:   [0.77, 0.40], hate:   [0.86, 0.20],
    car:     [0.15, 0.65], truck:  [0.17, 0.68], bus:    [0.13, 0.63],
    train:   [0.12, 0.60], plane:  [0.10, 0.55], ship:   [0.08, 0.50],
    run:     [0.42, 0.78], walk:   [0.40, 0.74], jog:    [0.41, 0.76],
    eat:     [0.38, 0.60], drink:  [0.36, 0.58], sleep:  [0.35, 0.55],
    big:     [0.55, 0.82], small:  [0.53, 0.78], huge:   [0.57, 0.84],
    tiny:    [0.51, 0.76], fast:   [0.44, 0.80], slow:   [0.43, 0.72],
    red:     [0.20, 0.15], blue:   [0.22, 0.12], green:  [0.18, 0.14],
    book:    [0.60, 0.42], read:   [0.58, 0.44], write:  [0.56, 0.46],
    music:   [0.32, 0.18], song:   [0.34, 0.20], dance:  [0.36, 0.22],
    water:   [0.20, 0.35], fire:   [0.88, 0.45], ice:    [0.18, 0.32],
    sun:     [0.90, 0.50], moon:   [0.15, 0.48], star:   [0.13, 0.52],
    doctor:  [0.68, 0.50], nurse:  [0.66, 0.48], hospital:[0.64, 0.46],
    school:  [0.58, 0.38], teacher:[0.56, 0.40], student:[0.54, 0.36],
    food:    [0.35, 0.56], pizza:  [0.37, 0.58], bread:  [0.33, 0.54],
    house:   [0.45, 0.50], home:   [0.47, 0.52], door:   [0.43, 0.48]
  };

  function dist(a, b) {
    var dx = a[0] - b[0];
    var dy = a[1] - b[1];
    return Math.sqrt(dx * dx + dy * dy);
  }

  function setupHiDPICanvas(canvas, w, h) {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return ctx;
  }

  function renderEmbeddings() {
    var input = document.getElementById('embedInput');
    var btn = document.getElementById('embedBtn');
    var canvas = document.getElementById('embedCanvas');
    var info = document.getElementById('embedInfo');
    if (!canvas || !btn) return;

    var dispW = 700, dispH = 400;
    var ctx = setupHiDPICanvas(canvas, dispW, dispH);
    var currentTarget = 'king';
    var wordPositions = [];

    function draw(target) {
      currentTarget = target.toLowerCase().trim();
      ctx.clearRect(0, 0, dispW, dispH);
      wordPositions = [];

      var targetVec = WORD_VECS[currentTarget];
      var words = Object.keys(WORD_VECS);

      var ranked = [];
      if (targetVec) {
        words.forEach(function (w) {
          if (w !== currentTarget) ranked.push({ w: w, d: dist(WORD_VECS[w], targetVec) });
        });
        ranked.sort(function (a, b) { return a.d - b.d; });
      }

      var pad = 40;

      // Draw connection lines first (under everything)
      if (targetVec) {
        var tx = pad + targetVec[0] * (dispW - 2 * pad);
        var ty = pad + (1 - targetVec[1]) * (dispH - 2 * pad);
        for (var ni = 0; ni < Math.min(5, ranked.length); ni++) {
          var nv = WORD_VECS[ranked[ni].w];
          var nx = pad + nv[0] * (dispW - 2 * pad);
          var ny = pad + (1 - nv[1]) * (dispH - 2 * pad);
          var alpha = 0.35 - ni * 0.05;
          var width = 2.5 - ni * 0.3;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(nx, ny);
          ctx.strokeStyle = 'rgba(5,150,105,' + alpha + ')';
          ctx.lineWidth = width;
          ctx.stroke();
        }
      }

      words.forEach(function (w) {
        var v = WORD_VECS[w];
        var x = pad + v[0] * (dispW - 2 * pad);
        var y = pad + (1 - v[1]) * (dispH - 2 * pad);
        var isTarget = w === currentTarget;
        var neighborIdx = -1;
        for (var ni = 0; ni < Math.min(5, ranked.length); ni++) {
          if (ranked[ni].w === w) { neighborIdx = ni; break; }
        }

        var radius;
        if (isTarget) {
          ctx.fillStyle = '#1e40af';
          ctx.font = 'bold 14px sans-serif';
          radius = 6;
        } else if (neighborIdx >= 0) {
          ctx.fillStyle = '#059669';
          ctx.font = 'bold 13px sans-serif';
          radius = 4.5;
        } else {
          ctx.fillStyle = '#94a3b8';
          ctx.font = '11px sans-serif';
          radius = 2.5;
        }

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        if (isTarget) {
          ctx.beginPath();
          ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(30,64,175,0.3)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.fillText(w, x + radius + 4, y + 4);

        wordPositions.push({ word: w, x: x, y: y, radius: Math.max(radius, 8) + ctx.measureText(w).width + 6 });
      });

      if (info) {
        if (!targetVec) {
          info.textContent = '"' + currentTarget + '" not in vocabulary. Try: king, cat, paris, happy, car, run, book, water, sun...';
        } else {
          var top5 = ranked.slice(0, 5).map(function (r) {
            return r.w + ' (' + r.d.toFixed(3) + ')';
          }).join(', ');
          info.textContent = 'Nearest to "' + currentTarget + '": ' + top5;
        }
      }
    }

    canvas.addEventListener('click', function (e) {
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      for (var i = 0; i < wordPositions.length; i++) {
        var wp = wordPositions[i];
        var dx = mx - wp.x;
        var dy = my - wp.y;
        if (Math.abs(dx) < wp.radius && Math.abs(dy) < 12) {
          input.value = wp.word;
          draw(wp.word);
          return;
        }
      }
    });

    canvas.style.cursor = 'pointer';
    btn.addEventListener('click', function () { draw(input.value); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') draw(input.value); });
    draw('king');
  }

  // ── Attention demo ────────────────────────────────────────────────

  var ATTN_DATA = [
    {
      words: ['I','sat','on','the','river','bank','and','watched','the','water','flow'],
      matrix: [
        [.40,.05,.03,.02,.02,.03,.02,.02,.02,.02,.02],
        [.30,.20,.05,.03,.03,.05,.03,.05,.03,.05,.05],
        [.05,.15,.30,.10,.03,.05,.03,.05,.03,.05,.03],
        [.03,.03,.08,.25,.15,.10,.03,.05,.05,.08,.05],
        [.02,.03,.03,.10,.30,.20,.03,.03,.03,.10,.05],
        [.02,.03,.03,.05,.35,.25,.03,.03,.02,.08,.05],
        [.05,.05,.03,.03,.05,.05,.25,.10,.05,.08,.08],
        [.03,.05,.03,.02,.05,.05,.08,.25,.03,.15,.15],
        [.03,.02,.03,.15,.03,.03,.03,.05,.25,.15,.10],
        [.02,.02,.02,.05,.10,.05,.03,.10,.10,.28,.15],
        [.02,.03,.02,.03,.08,.05,.05,.12,.05,.18,.28]
      ]
    },
    {
      words: ['I','went','to','the','bank','to','deposit','my','money'],
      matrix: [
        [.40,.08,.03,.03,.05,.03,.05,.05,.03],
        [.20,.25,.08,.03,.05,.03,.08,.03,.05],
        [.05,.12,.25,.10,.08,.05,.08,.03,.05],
        [.03,.05,.08,.25,.18,.05,.10,.03,.08],
        [.03,.05,.05,.10,.20,.05,.20,.03,.18],
        [.05,.08,.10,.05,.08,.20,.12,.05,.08],
        [.03,.05,.05,.05,.18,.08,.22,.08,.15],
        [.08,.03,.03,.03,.05,.03,.05,.30,.20],
        [.03,.03,.03,.05,.15,.05,.18,.15,.25]
      ]
    },
    {
      words: ['The','cat','sat','on','the','mat','because','it','was','warm'],
      matrix: [
        [.30,.15,.05,.03,.05,.05,.03,.05,.03,.03],
        [.10,.28,.08,.03,.03,.05,.03,.12,.05,.05],
        [.05,.18,.25,.08,.03,.08,.03,.08,.05,.05],
        [.03,.05,.10,.30,.08,.12,.03,.03,.03,.03],
        [.03,.03,.03,.08,.28,.18,.03,.05,.05,.05],
        [.03,.05,.05,.10,.15,.25,.03,.03,.05,.08],
        [.03,.08,.08,.03,.03,.05,.22,.10,.10,.10],
        [.05,.25,.05,.03,.03,.05,.10,.20,.05,.05],
        [.03,.05,.08,.03,.03,.08,.10,.08,.25,.15],
        [.03,.03,.05,.03,.03,.12,.08,.05,.15,.28]
      ]
    },
    {
      words: ['She','gave','him','the','book','that','she','had','been','reading'],
      matrix: [
        [.30,.10,.08,.03,.05,.03,.10,.03,.03,.05],
        [.12,.22,.12,.05,.10,.03,.05,.05,.03,.05],
        [.15,.15,.20,.05,.05,.03,.05,.03,.03,.03],
        [.03,.05,.03,.28,.18,.05,.03,.03,.03,.08],
        [.03,.08,.05,.15,.22,.05,.03,.03,.03,.12],
        [.05,.05,.03,.08,.15,.20,.05,.05,.05,.12],
        [.18,.05,.05,.03,.03,.05,.25,.08,.05,.05],
        [.05,.10,.03,.03,.05,.05,.08,.22,.12,.10],
        [.03,.05,.03,.03,.03,.03,.05,.15,.25,.18],
        [.03,.08,.03,.05,.15,.08,.03,.08,.12,.22]
      ]
    }
  ];

  function renderAttention() {
    var select = document.getElementById('attnSentence');
    var display = document.getElementById('attnDisplay');
    var info = document.getElementById('attnInfo');
    if (!select || !display) return;

    var selectedWord = -1;

    function attnColor(weight, maxWeight) {
      var t = Math.min(weight / maxWeight, 1);
      var r = Math.round(59 + (30 - 59) * t);
      var g = Math.round(130 + (64 - 130) * t);
      var b = Math.round(246 + (175 - 246) * t);
      var a = 0.12 + t * 0.55;
      return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }

    function draw() {
      var idx = parseInt(select.value, 10);
      var data = ATTN_DATA[idx];
      display.innerHTML = '';

      var weights = null;
      var maxW = 0;
      if (selectedWord >= 0 && selectedWord < data.words.length) {
        weights = data.matrix[selectedWord];
        maxW = Math.max.apply(null, weights);
      }

      var wordRow = document.createElement('div');
      wordRow.style.marginBottom = '12px';

      data.words.forEach(function (w, wi) {
        var span = document.createElement('span');
        span.className = 'attn-word';
        span.textContent = w;

        if (wi === selectedWord) {
          span.classList.add('selected');
        } else if (weights) {
          span.style.background = attnColor(weights[wi], maxW);
          if (weights[wi] / maxW > 0.6) span.style.color = '#fff';
        }

        span.addEventListener('click', function () {
          selectedWord = wi;
          draw();
        });
        wordRow.appendChild(span);
      });
      display.appendChild(wordRow);

      if (weights) {
        var barsDiv = document.createElement('div');
        barsDiv.className = 'attn-lines';

        var pairs = data.words.map(function (w, wi) {
          return { word: w, weight: weights[wi], idx: wi };
        });
        pairs.sort(function (a, b) { return b.weight - a.weight; });

        pairs.forEach(function (p) {
          var row = document.createElement('div');
          row.className = 'attn-bar';

          var label = document.createElement('span');
          label.className = 'attn-bar-label';
          label.textContent = p.word;

          var barBg = document.createElement('div');
          barBg.style.flex = '1';
          barBg.style.background = '#e5e7eb';
          barBg.style.borderRadius = '3px';
          barBg.style.overflow = 'hidden';
          barBg.style.height = '14px';

          var fill = document.createElement('div');
          fill.className = 'attn-bar-fill';
          fill.style.width = ((p.weight / maxW) * 100) + '%';
          if (p.idx === selectedWord) fill.style.background = '#1e40af';
          barBg.appendChild(fill);

          var val = document.createElement('span');
          val.className = 'attn-bar-val';
          val.textContent = (p.weight * 100).toFixed(1) + '%';

          row.appendChild(label);
          row.appendChild(barBg);
          row.appendChild(val);
          barsDiv.appendChild(row);
        });

        display.appendChild(barsDiv);

        if (info) {
          var top = pairs.slice(0, 3).map(function (p) { return '"' + p.word + '"'; }).join(', ');
          info.textContent = '"' + data.words[selectedWord] + '" attends most to ' + top;
        }
      } else if (info) {
        info.textContent = 'Click a word above to see its attention pattern.';
      }
    }

    select.addEventListener('change', function () { selectedWord = -1; draw(); });
    draw();
  }

  // ── Next-word prediction demo ─────────────────────────────────────

  var PRED_TABLE = {
    'the capital of france is': [
      ['Paris', 0.88], ['a', 0.04], ['located', 0.02], ['the', 0.015], ['known', 0.01], ['one', 0.008], ['not', 0.005], ['still', 0.004]
    ],
    'the capital of italy is': [
      ['Rome', 0.85], ['a', 0.04], ['located', 0.03], ['the', 0.02], ['not', 0.01], ['one', 0.008], ['still', 0.005], ['known', 0.005]
    ],
    'the capital of germany is': [
      ['Berlin', 0.86], ['a', 0.03], ['located', 0.025], ['the', 0.02], ['not', 0.01], ['one', 0.008], ['known', 0.005], ['still', 0.004]
    ],
    'the capital of spain is': [
      ['Madrid', 0.87], ['a', 0.03], ['located', 0.02], ['the', 0.015], ['not', 0.01], ['known', 0.007], ['one', 0.005], ['still', 0.004]
    ],
    'the capital of japan is': [
      ['Tokyo', 0.90], ['a', 0.03], ['located', 0.02], ['the', 0.01], ['one', 0.007], ['not', 0.005], ['known', 0.004], ['still', 0.003]
    ],
    'the capital of': [
      ['the', 0.15], ['France', 0.08], ['Italy', 0.06], ['Germany', 0.05], ['Spain', 0.04], ['Japan', 0.04], ['England', 0.03], ['China', 0.03]
    ],
    'i went to the': [
      ['store', 0.18], ['park', 0.12], ['hospital', 0.08], ['beach', 0.07], ['bank', 0.06], ['library', 0.05], ['gym', 0.04], ['office', 0.04]
    ],
    'she said that the': [
      ['best', 0.10], ['only', 0.08], ['most', 0.07], ['first', 0.06], ['new', 0.06], ['old', 0.05], ['problem', 0.04], ['reason', 0.04]
    ],
    'he told me that': [
      ['he', 0.14], ['the', 0.10], ['it', 0.09], ['she', 0.07], ['his', 0.05], ['they', 0.04], ['I', 0.04], ['we', 0.03]
    ],
    'once upon a time there was a': [
      ['young', 0.15], ['king', 0.12], ['man', 0.10], ['little', 0.09], ['beautiful', 0.07], ['wise', 0.06], ['small', 0.05], ['great', 0.05]
    ],
    'once upon a time': [
      ['there', 0.30], [',', 0.20], ['in', 0.10], ['a', 0.08], ['the', 0.05], ['I', 0.04], ['we', 0.03], ['when', 0.03]
    ],
    'the weather today is': [
      ['beautiful', 0.15], ['nice', 0.12], ['cold', 0.10], ['warm', 0.09], ['sunny', 0.08], ['rainy', 0.06], ['perfect', 0.05], ['terrible', 0.04]
    ],
    'my favorite food is': [
      ['pizza', 0.18], ['pasta', 0.12], ['sushi', 0.08], ['rice', 0.06], ['chicken', 0.05], ['chocolate', 0.05], ['bread', 0.04], ['fish', 0.04]
    ],
    'the cat sat on the': [
      ['mat', 0.25], ['bed', 0.12], ['floor', 0.10], ['couch', 0.08], ['table', 0.06], ['chair', 0.05], ['windowsill', 0.04], ['roof', 0.03]
    ],
    'in the beginning there was': [
      ['nothing', 0.18], ['light', 0.12], ['darkness', 0.10], ['a', 0.09], ['the', 0.07], ['only', 0.06], ['no', 0.04], ['silence', 0.04]
    ],
    'i think that': [
      ['the', 0.14], ['it', 0.12], ['we', 0.08], ['this', 0.07], ['I', 0.06], ['there', 0.05], ['you', 0.04], ['he', 0.04]
    ],
    'my dad asked me': [
      ['to', 0.22], ['about', 0.14], ['how', 0.10], ['if', 0.09], ['what', 0.08], ['why', 0.06], ['whether', 0.04], ['for', 0.03]
    ],
    'the meaning of life is': [
      ['a', 0.12], ['to', 0.10], ['not', 0.08], ['something', 0.07], ['the', 0.06], ['about', 0.05], ['found', 0.04], ['love', 0.04]
    ],
    'artificial intelligence is': [
      ['a', 0.14], ['the', 0.10], ['not', 0.08], ['an', 0.06], ['already', 0.05], ['being', 0.04], ['used', 0.04], ['becoming', 0.04]
    ],
    'the best way to learn is': [
      ['by', 0.28], ['to', 0.20], ['through', 0.12], ['from', 0.08], ['not', 0.05], ['practice', 0.04], ['actually', 0.03], ['doing', 0.03]
    ],
    'i love': [
      ['you', 0.25], ['the', 0.10], ['it', 0.08], ['this', 0.06], ['my', 0.05], ['how', 0.04], ['that', 0.04], ['to', 0.03]
    ],
    'the most important thing is': [
      ['that', 0.18], ['to', 0.15], ['the', 0.08], ['not', 0.06], ['your', 0.05], ['finding', 0.04], ['being', 0.04], ['how', 0.03]
    ],
    'water is': [
      ['a', 0.15], ['essential', 0.08], ['the', 0.07], ['not', 0.06], ['one', 0.05], ['an', 0.04], ['wet', 0.04], ['important', 0.04]
    ]
  };

  function findPredictions(text) {
    var key = text.toLowerCase().trim().replace(/\s+/g, ' ');
    if (PRED_TABLE[key]) return PRED_TABLE[key];

    // Try suffix matching (user typed more than needed)
    var keys = Object.keys(PRED_TABLE);
    var bestMatch = null;
    var bestLen = 0;
    for (var i = 0; i < keys.length; i++) {
      if (key.indexOf(keys[i]) !== -1 && keys[i].length > bestLen) {
        bestMatch = keys[i];
        bestLen = keys[i].length;
      }
      if (keys[i].indexOf(key) !== -1 && keys[i].length > bestLen) {
        bestMatch = keys[i];
        bestLen = keys[i].length;
      }
    }
    if (bestMatch) return PRED_TABLE[bestMatch];

    // Try matching last N words against table keys
    var inputWords = key.split(' ');
    for (var n = Math.min(inputWords.length, 8); n >= 2; n--) {
      var tail = inputWords.slice(-n).join(' ');
      if (PRED_TABLE[tail]) return PRED_TABLE[tail];
      for (var j = 0; j < keys.length; j++) {
        if (keys[j].indexOf(tail) !== -1 || tail.indexOf(keys[j]) !== -1) return PRED_TABLE[keys[j]];
      }
    }

    return [
      ['the', 0.12], ['a', 0.08], ['to', 0.06], ['and', 0.05], ['of', 0.04],
      ['is', 0.04], ['in', 0.03], ['that', 0.03]
    ];
  }

  function renderPrediction() {
    var input = document.getElementById('predInput');
    var btn = document.getElementById('predBtn');
    var output = document.getElementById('predOutput');
    if (!input || !btn || !output) return;

    function show() {
      var preds = findPredictions(input.value);
      output.innerHTML = '';
      var maxP = preds[0][1];
      preds.forEach(function (p) {
        var row = document.createElement('div');
        row.className = 'pred-row';

        var word = document.createElement('span');
        word.className = 'pred-word';
        word.textContent = p[0];

        var barBg = document.createElement('div');
        barBg.className = 'pred-bar-bg';
        var fill = document.createElement('div');
        fill.className = 'pred-bar-fill';
        fill.style.width = ((p[1] / maxP) * 100) + '%';
        barBg.appendChild(fill);

        var pct = document.createElement('span');
        pct.className = 'pred-pct';
        pct.textContent = (p[1] * 100).toFixed(1) + '%';

        row.appendChild(word);
        row.appendChild(barBg);
        row.appendChild(pct);
        output.appendChild(row);
      });
    }

    btn.addEventListener('click', show);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); show(); } });
    show();
  }

  // ── Temperature demo ──────────────────────────────────────────────

  function softmax(logits, temperature) {
    var t = Math.max(temperature, 0.01);
    var scaled = logits.map(function (l) { return l / t; });
    var maxVal = Math.max.apply(null, scaled);
    var exps = scaled.map(function (s) { return Math.exp(s - maxVal); });
    var sum = exps.reduce(function (a, b) { return a + b; }, 0);
    return exps.map(function (e) { return e / sum; });
  }

  function sampleFromDist(probs) {
    var r = Math.random();
    var cumulative = 0;
    for (var i = 0; i < probs.length; i++) {
      cumulative += probs[i];
      if (r < cumulative) return i;
    }
    return probs.length - 1;
  }

  // Each prompt maps to a chain: after picking word N, the context
  // shifts and a different distribution applies for word N+1.
  // This makes generated sequences read like plausible continuations
  // instead of random word salad.

  var TEMP_CHAINS = {
    'once upon a time there was a': [
      { words: ['young','king','man','little','beautiful','wise','old','poor','brave','lonely'], logits: [3.2,2.8,2.5,2.3,2.0,1.8,1.6,1.1,0.9,0.6] },
      { words: ['prince','woman','girl','farmer','child','dragon','fox','soldier','queen','wizard'], logits: [2.6,2.4,2.2,2.0,1.9,1.5,1.3,1.1,1.0,0.8] },
      { words: ['who','that','named','living','from','with','called','lost','known','born'], logits: [3.5,2.8,2.2,1.8,1.6,1.5,1.3,1.0,0.8,0.7] },
      { words: ['lived','wanted','loved','dreamed','searched','traveled','discovered','ruled','feared','believed'], logits: [3.0,2.5,2.0,1.8,1.5,1.3,1.1,1.0,0.8,0.6] },
      { words: ['in','for','to','beyond','near','above','across','among','through','beside'], logits: [3.2,2.6,2.4,1.5,1.3,1.0,0.9,0.8,0.7,0.5] }
    ],
    'the cat sat on the': [
      { words: ['mat','bed','floor','couch','table','chair','windowsill','roof','porch','rug'], logits: [3.5,2.5,2.3,2.0,1.7,1.5,1.3,1.0,0.7,0.5] },
      { words: ['and','while','until',',','because','as','watching','waiting','looking','then'], logits: [3.0,2.4,2.0,1.8,1.7,1.5,1.2,1.0,0.9,0.8] },
      { words: ['the','its','a','she','he','nothing','everything','someone','nobody','it'], logits: [3.2,2.5,2.0,1.8,1.6,1.0,0.8,0.7,0.5,0.4] },
      { words: ['sun','owner','dog','rain','world','children','mouse','birds','door','house'], logits: [2.8,2.5,2.3,2.0,1.5,1.4,1.2,1.0,0.9,0.8] },
      { words: ['went','came','set','moved','fell','shone','opened','appeared','passed','arrived'], logits: [2.5,2.3,2.1,1.8,1.7,1.6,1.3,1.1,1.0,0.8] }
    ],
    'the weather today is': [
      { words: ['beautiful','nice','cold','warm','sunny','rainy','perfect','terrible','cloudy','hot'], logits: [3.0,2.7,2.4,2.2,2.0,1.7,1.5,1.2,1.1,1.0] },
      { words: [',','and','but','with','—','so','.','which','for','making'], logits: [3.0,2.8,2.5,2.0,1.5,1.4,1.2,1.0,0.8,0.7] },
      { words: ['the','a','perfect','exactly','just','ideal','good','great','really','surprisingly'], logits: [2.8,2.5,2.2,1.8,1.7,1.5,1.3,1.2,1.0,0.9] },
      { words: ['kind','sort','type','weather','day','temperature','conditions','sky','air','wind'], logits: [2.5,2.3,2.0,1.9,1.8,1.5,1.3,1.1,1.0,0.8] },
      { words: ['of','for','that','where','when','I','we','you','people','everyone'], logits: [3.0,2.5,2.2,1.8,1.5,1.3,1.2,1.0,0.9,0.8] }
    ],
    'i went to the': [
      { words: ['store','park','hospital','beach','bank','library','gym','office','school','market'], logits: [2.8,2.5,2.1,2.0,1.8,1.6,1.4,1.4,1.3,1.2] },
      { words: ['and','to','where','but',',','because','after','before','with','for'], logits: [3.0,2.5,2.3,2.0,1.8,1.5,1.3,1.2,1.0,0.9] },
      { words: ['bought','found','saw','met','asked','got','picked','waited','looked','sat'], logits: [2.8,2.5,2.3,2.0,1.8,1.6,1.4,1.2,1.1,1.0] },
      { words: ['a','the','some','my','her','his','two','several','three','an'], logits: [3.0,2.8,2.0,1.8,1.5,1.3,1.1,1.0,0.8,0.7] },
      { words: ['new','few','book','friend','coffee','bag','old','ticket','gift','bottle'], logits: [2.5,2.2,2.0,1.8,1.7,1.5,1.3,1.1,1.0,0.9] }
    ],
    'i am very': [
      { words: ['happy','tired','excited','sorry','grateful','worried','proud','curious','confused','hungry'], logits: [3.0,2.7,2.4,2.2,2.0,1.8,1.6,1.4,1.2,1.0] },
      { words: ['to','about','that','with','today','right','and','because','but',','], logits: [3.2,2.8,2.5,2.0,1.8,1.6,1.4,1.2,1.0,0.8] },
      { words: ['be','hear','see','know','have','say','tell','announce','report','share'], logits: [3.0,2.5,2.2,2.0,1.8,1.5,1.3,1.1,0.9,0.8] },
      { words: ['here','that','this','able','part','alive','working','doing','going','back'], logits: [2.8,2.5,2.2,2.0,1.8,1.5,1.3,1.1,1.0,0.8] },
      { words: ['today','now','again','finally','.','!','together','soon','with','and'], logits: [2.5,2.3,2.0,1.8,1.7,1.5,1.3,1.1,1.0,0.8] }
    ],
    'my father told me': [
      { words: ['that','about','to','a','the','how','why','what','his','never'], logits: [3.2,2.5,2.3,1.8,1.6,1.5,1.3,1.2,1.0,0.8] },
      { words: ['story','he','the','life','I','truth','everything','nothing','it','success'], logits: [2.8,2.6,2.3,2.0,1.8,1.5,1.3,1.1,1.0,0.8] },
      { words: ['was','is','would','had','should','could','always','never','once','still'], logits: [3.0,2.5,2.3,2.0,1.8,1.5,1.3,1.1,1.0,0.8] },
      { words: ['the','not','about','always','never','worth','important','hard','easy','possible'], logits: [2.8,2.5,2.2,2.0,1.8,1.5,1.3,1.1,1.0,0.8] },
      { words: ['most','best','only','real','right','same','first','last','whole','true'], logits: [2.6,2.4,2.2,2.0,1.8,1.5,1.3,1.1,1.0,0.8] }
    ]
  };

  function findTempChain(text) {
    var key = text.toLowerCase().trim().replace(/\s+/g, ' ');
    if (TEMP_CHAINS[key]) return TEMP_CHAINS[key];
    var keys = Object.keys(TEMP_CHAINS);
    var bestMatch = null;
    var bestLen = 0;
    for (var i = 0; i < keys.length; i++) {
      if ((key.indexOf(keys[i]) !== -1 || keys[i].indexOf(key) !== -1) && keys[i].length > bestLen) {
        bestMatch = keys[i];
        bestLen = keys[i].length;
      }
    }
    if (bestMatch) return TEMP_CHAINS[bestMatch];

    var inputWords = key.split(' ');
    for (var n = Math.min(inputWords.length, 8); n >= 2; n--) {
      var tail = inputWords.slice(-n).join(' ');
      if (TEMP_CHAINS[tail]) return TEMP_CHAINS[tail];
      for (var j = 0; j < keys.length; j++) {
        if (keys[j].indexOf(tail) !== -1 || tail.indexOf(keys[j]) !== -1) return TEMP_CHAINS[keys[j]];
      }
    }

    return TEMP_CHAINS['once upon a time there was a'];
  }

  function renderTemperature() {
    var slider = document.getElementById('tempSlider');
    var tempVal = document.getElementById('tempValue');
    var promptInput = document.getElementById('tempPrompt');
    var genBtn = document.getElementById('tempGenBtn');
    var output = document.getElementById('tempOutput');
    var canvas = document.getElementById('tempCanvas');
    if (!slider || !genBtn || !canvas) return;

    var chartW = 700, chartH = 220;
    var ctx = setupHiDPICanvas(canvas, chartW, chartH);

    function generate() {
      var temp = parseInt(slider.value, 10) / 100;
      if (tempVal) tempVal.textContent = temp.toFixed(2);

      var chain = findTempChain(promptInput ? promptInput.value : '');
      var firstProbs = softmax(chain[0].logits, temp);
      var sampledFirst = sampleFromDist(firstProbs);

      var words = [chain[0].words[sampledFirst]];
      for (var s = 1; s < chain.length; s++) {
        var stepProbs = softmax(chain[s].logits, temp);
        words.push(chain[s].words[sampleFromDist(stepProbs)]);
      }

      if (output) {
        var prompt = promptInput ? promptInput.value : '';
        var html = prompt;
        words.forEach(function (w) {
          html += ' <span class="sampled">' + w + '</span>';
        });
        output.innerHTML = html;
      }

      drawChart(ctx, chain[0].words, firstProbs, sampledFirst);
    }

    function drawChart(c, words, probs, sampledIdx) {
      c.clearRect(0, 0, chartW, chartH);

      var topN = 10;
      var items = probs.map(function (p, i) { return { word: words[i], prob: p, idx: i }; });
      items.sort(function (a, b) { return b.prob - a.prob; });
      items = items.slice(0, topN);

      var barH = 16;
      var gap = 6;
      var labelW = 90;
      var rightPad = 50;
      var topPad = 10;
      var maxBarW = chartW - labelW - rightPad - 10;

      items.forEach(function (item, row) {
        var y = topPad + row * (barH + gap);

        c.fillStyle = '#475569';
        c.font = '12px sans-serif';
        c.textAlign = 'right';
        c.fillText(item.word, labelW - 6, y + 12);

        var bw = item.prob * maxBarW;
        c.fillStyle = item.idx === sampledIdx ? '#1e40af' : '#93c5fd';
        c.fillRect(labelW, y, Math.max(bw, 2), barH);

        c.fillStyle = '#64748b';
        c.textAlign = 'left';
        c.font = '11px sans-serif';
        c.fillText((item.prob * 100).toFixed(1) + '%', labelW + bw + 5, y + 12);
      });
    }

    slider.addEventListener('input', function () {
      generate();
    });

    genBtn.addEventListener('click', generate);
    if (promptInput) promptInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') generate();
    });
    generate();
  }

  // ── Init ──────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    renderTokenizer();
    renderEmbeddings();
    renderAttention();
    renderPrediction();
    renderTemperature();
  });
})();
