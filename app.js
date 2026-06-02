// SキングハナハナSP-30 解析定数 (完全攻略・BOM付きUTF-8動作)
const SPECS = {
    // ボーナス確率 (分母)
    p_big: { 1: 1/292, 2: 1/280, 3: 1/268, 4: 1/253, 5: 1/240, 6: 1/232 },
    p_reg: { 1: 1/489, 2: 1/464, 3: 1/439, 4: 1/407, 5: 1/374, 6: 1/332 },
    
    // BIG中スイカ確率 (二項分布用: 1BIG=20Gあたりの小役確率)
    p_watermelon: { 1: 1/48, 2: 1/44, 3: 1/40, 4: 1/36, 5: 1/33, 6: 1/30 },
    
    // REG中サイドランプフラッシュ振り分け
    p_lamp: {
        // 奇数設定示唆 (青・緑)
        odd:  { 1: 0.60, 2: 0.40, 3: 0.60, 4: 0.40, 5: 0.60, 6: 0.50 },
        // 偶数設定示唆 (黄・赤)
        even: { 1: 0.40, 2: 0.60, 3: 0.40, 4: 0.60, 5: 0.40, 6: 0.50 },
        // 虹フラッシュ (設定5・6濃厚、1-4はほぼ0%だがゼロ除算防止のため極小値を設定)
        rainbow: { 1: 0.0001, 2: 0.0001, 3: 0.0001, 4: 0.0001, 5: 0.02, 6: 0.05 }
    },
    
    // ボーナス終了時フェザーランプ振り分け
    p_feather: {
        // 緑・赤点滅 (高設定示唆)
        high: { 1: 0.03, 2: 0.04, 3: 0.05, 4: 0.10, 5: 0.15, 6: 0.20 },
        // 虹点滅 (設定5・6濃厚)
        rainbow: { 1: 0.0001, 2: 0.0001, 3: 0.0001, 4: 0.0001, 5: 0.02, 6: 0.05 }
    }
};

// UI制御: アコーディオン開閉
function toggleAccordion() {
    const content = document.getElementById('accordion-content');
    const arrow = document.getElementById('accordion-arrow');
    
    if (content.classList.contains('open')) {
        content.classList.remove('open');
        arrow.classList.remove('open');
    } else {
        content.classList.add('open');
        arrow.classList.add('open');
    }
}

// UI制御: スマートフォン用値の加減ボタン
function adjustValue(inputId, step) {
    const input = document.getElementById(inputId);
    let val = parseInt(input.value) || 0;
    val += step;
    if (val < 0) val = 0;
    
    // 上限値の設定 (安全策)
    if (inputId === 'total-games' && val > 99999) val = 99999;
    if ((inputId === 'big-count' || inputId === 'reg-count') && val > 99) val = 99;
    if (inputId === 'watermelon-count' && val > 99) val = 99;
    
    input.value = val;
}

// 統計処理用: 階乗の対数 (対数ポアソン/二項分布の計算用、アンダーフロー防止)
const factorialCache = [0];
function logFactorial(n) {
    if (n < 0) return -Infinity;
    if (factorialCache[n] !== undefined) return factorialCache[n];
    
    let sum = factorialCache[factorialCache.length - 1];
    for (let i = factorialCache.length; i <= n; i++) {
        sum += Math.log(i);
        factorialCache[i] = sum;
    }
    return factorialCache[n];
}

// ポアソン対数尤度
function logPoisson(x, lambda) {
    if (lambda <= 0) return -Infinity;
    return x * Math.log(lambda) - lambda - logFactorial(x);
}

// 二項分布対数尤度
function logBinomial(k, N, p) {
    if (N < k) return -Infinity;
    if (k < 0 || N < 0) return -Infinity;
    if (p <= 0 || p >= 1) return -Infinity;
    const logComb = logFactorial(N) - logFactorial(k) - logFactorial(N - k);
    return logComb + k * Math.log(p) + (N - k) * Math.log(1 - p);
}

// 押し引き判定およびベイズ設定推測を実行するメイン関数
function performJudgment() {
    // 1. 入力値の取得
    const totalGames = parseInt(document.getElementById('total-games').value) || 0;
    const bigCount = parseInt(document.getElementById('big-count').value) || 0;
    const regCount = parseInt(document.getElementById('reg-count').value) || 0;
    
    const watermelonCount = parseInt(document.getElementById('watermelon-count').value) || 0;
    const lampOdd = parseInt(document.getElementById('lamp-odd').value) || 0;
    const lampEven = parseInt(document.getElementById('lamp-even').value) || 0;
    const lampRainbow = document.getElementById('lamp-rainbow').checked;
    
    const featherHigh = document.getElementById('feather-high').checked;
    const featherRainbow = document.getElementById('feather-rainbow').checked;
    
    // 最低限のバリデーション
    if (totalGames <= 0) {
        alert("総ゲーム数に 1 以上の数値を入力してください。");
        return;
    }

    // 2. ベイズ推定による設定推測
    const prior = [1/6, 1/6, 1/6, 1/6, 1/6, 1/6]; // 事前確率は均等
    let logLikelihoods = [0, 0, 0, 0, 0, 0]; // 対数尤度
    
    for (let s = 1; s <= 6; s++) {
        // A. BIG確率の尤度
        const lambdaB = totalGames * SPECS.p_big[s];
        logLikelihoods[s-1] += logPoisson(bigCount, lambdaB);
        
        // B. REG確率の尤度
        const lambdaR = totalGames * SPECS.p_reg[s];
        logLikelihoods[s-1] += logPoisson(regCount, lambdaR);
        
        // C. BIG中スイカの尤度 (BIGが1回以上かつ入力がある場合)
        if (bigCount > 0 && watermelonCount > 0) {
            const bigGames = bigCount * 20; // 1BIGあたり20G
            logLikelihoods[s-1] += logBinomial(watermelonCount, bigGames, SPECS.p_watermelon[s]);
        }
        
        // D. REG中サイドランプの尤度
        if (lampOdd > 0 || lampEven > 0) {
            const totalLamps = lampOdd + lampEven;
            const logComb = logFactorial(totalLamps) - logFactorial(lampOdd) - logFactorial(lampEven);
            logLikelihoods[s-1] += logComb + lampOdd * Math.log(SPECS.p_lamp.odd[s]) + lampEven * Math.log(SPECS.p_lamp.even[s]);
        }
        if (lampRainbow) {
            logLikelihoods[s-1] += Math.log(SPECS.p_lamp.rainbow[s]);
        }
        
        // E. 終了時フェザーランプの尤度
        if (featherHigh) {
            logLikelihoods[s-1] += Math.log(SPECS.p_feather.high[s]);
        }
        if (featherRainbow) {
            logLikelihoods[s-1] += Math.log(SPECS.p_feather.rainbow[s]);
        }
    }
    
    // 指数対数トリックによるソフトマックス正規化 (アンダーフロー防止)
    const maxLog = Math.max(...logLikelihoods);
    let sumExp = 0;
    let postProb = [];
    
    for (let i = 0; i < 6; i++) {
        postProb[i] = Math.exp(logLikelihoods[i] - maxLog) * prior[i];
        sumExp += postProb[i];
    }
    
    // パーセンテージへの変換
    let probabilities = [];
    for (let i = 0; i < 6; i++) {
        probabilities[i] = (postProb[i] / sumExp) * 100;
    }

    // 3. UIの更新と結果表示
    displayResults(totalGames, bigCount, regCount, probabilities);
}

// 判定結果画面を組み立てて描画する関数
function displayResults(totalGames, bigCount, regCount, probabilities) {
    const resultSection = document.getElementById('result-section');
    resultSection.style.display = 'block'; // 表示
    
    // 実戦スペックの計算
    const combinedProb = (bigCount + regCount) > 0 ? `1/${(totalGames / (bigCount + regCount)).toFixed(1)}` : "-";
    const bigProb = bigCount > 0 ? `1/${(totalGames / bigCount).toFixed(1)}` : "-";
    const regProb = regCount > 0 ? `1/${(totalGames / regCount).toFixed(1)}` : "-";
    
    document.getElementById('spec-combined').innerText = combinedProb;
    document.getElementById('spec-big').innerText = bigProb;
    document.getElementById('spec-reg').innerText = regProb;
    
    // 各設定のプログレスバーをアニメーション付きで伸ばす
    for (let s = 1; s <= 6; s++) {
        const percent = probabilities[s-1];
        const bar = document.getElementById(`bar-${s}`);
        const valText = document.getElementById(`val-${s}`);
        
        // 幅を設定 (アニメーションが効きます)
        bar.style.width = `${percent}%`;
        valText.innerText = `${percent.toFixed(1)}%`;
    }
    
    // 押し引きの診断ロジック
    const probHigh = probabilities[3] + probabilities[4] + probabilities[5]; // 設定4・5・6の合計確率
    const probLow = probabilities[0] + probabilities[1]; // 設定1・2の合計確率
    
    const adviceCard = document.getElementById('advice-card');
    const adviceBadge = document.getElementById('advice-badge');
    const adviceTitle = document.getElementById('advice-title');
    const adviceDescription = document.getElementById('advice-description');
    
    // CSSクラスの初期化
    adviceCard.className = "result-card card";
    
    if (totalGames < 1500) {
        // ゲーム数が少なすぎる場合
        adviceCard.classList.add('theme-caution');
        adviceBadge.innerText = "!?";
        adviceTitle.innerText = "様子見を推奨 (判断保留)";
        adviceDescription.innerText = `現在 ${totalGames.toLocaleString()}G と、サンプル数がまだ少なめです。合算は現在 ${combinedProb} ですが、Aタイプは2,000G前後まで極めて荒れやすいため、グラフの波だけでなくホールの特定日・並びなどの「根拠」や、スイカ・サイドランプの動向を優先して慎重に様子を見ましょう。`;
    } else {
        // 十分なゲーム数がある場合
        if (probHigh >= 60) {
            // 押し (GO)
            adviceCard.classList.add('theme-go');
            adviceBadge.innerText = "GO";
            adviceTitle.innerText = "続行を強く推奨 (押し！)";
            adviceDescription.innerText = `設定4・5・6の期待度が ${probHigh.toFixed(1)}% と極めて高い数値を示しています。特にREG確率が非常に優秀で、スランプグラフも安定している可能性が高いです。高設定（設定5・6）を掴んでいる可能性が濃厚ですので、閉店前まで粘り強くブン回すことを強く推奨します！`;
        } else if (probLow >= 60) {
            // 引き (STOP)
            adviceCard.classList.add('theme-stop');
            adviceBadge.innerText = "STOP";
            adviceTitle.innerText = "遊技終了を推奨 (引き！)";
            adviceDescription.innerText = `設定1・2の期待度が ${probLow.toFixed(1)}% と圧倒的に優勢な状態です。一時的なBIGの偏り（引き強）でグラフがプラス域にいたとしても、今後急降下する危険性が非常に高いです。傷が浅いうちに追加投資をやめ、スマートに引き際と判断することをおすすめします。`;
        } else {
            // 様子見 (CAUTION)
            adviceCard.classList.add('theme-caution');
            adviceBadge.innerText = "CAUTION";
            adviceTitle.innerText = "様子見・慎重な判断を推奨";
            adviceDescription.innerText = `設定4・5・6の期待度が ${probHigh.toFixed(1)}% と、中間設定（設定3・4）もしくは低設定の引き強の境界線上にあります。スランプグラフがモミモミ状態になりやすい挙動です。周りの台の状況や、BIG中スイカなどの「中身」の強さに強い自信がない限りは、深追いせず引き気味に立ち回るのが安全です。`;
        }
    }
    
    // スクロールして結果を表示
    setTimeout(() => {
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}
