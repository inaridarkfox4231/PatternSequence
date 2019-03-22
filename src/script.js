// 主な変更点：
// IDLE, IN_PROGRESS, COMPLETEDを廃止、代わりにIDLE, PRE, ACTにする
// 初期状態IDLEでactorを初期化、ゆえにflowの初期設定は廃止。
// setFlowメソッドでflowをセットする。その際flowにはPREから始まるのか
// ACTから始まるのかを指定するinitialStateというプロパティが用意されていてそれを嵌めることで
// 初期stateが決まる仕組みにする。ACTからの場合initializeは存在しないことになる。
// PREからの場合、executeの最初に「PREならばinitializeせよ」と書かれていてそれをまずやることにし、
// そのあとACTにしつつnoMotionで内容に入る感じ。
// convertも廃止。代わりに、executeの中に終了条件を書いておいて、
// その中に終了した時の処理をせよ、とだけ書く。
// 終了処理のデフォルトを単にsetFlowにすれば自動的に初期状態とか決まる。
// 終了時に何かさせたかったらオーバーライド、なおこれによるフレーム消費もなくなる。
// なので、最初のようなただ単に動くだけのようなモーションシークエンスの場合は、
// 当時のような滑らかな動きが実現することになる。
// ハブでのセクションチェンジも1フレームで終わるので以前ほどカクカクしなくて済む、はず・・
// なお次の行先がない場合はIDLEにしてsetFlowをundefinedにしてinActivateしつつ処理を抜ける。以上。
'use strict';

let all;
let hueSet = [];
let clickPosX;
let clickPosY;
let keyFlag;
let myCanvas;

const IDLE = 0;
const PRE = 1;
const ACT = 2;

const ROLLING = 0;  // figureの描画モード、回転
const ORIENTED = 1; // figureの描画モード、指向

const CREATURE = 0; // アクター生成用
const BULLET = 1;

// やってみるかー
const PATTERN_NUM = 14; // パターン増やすときはここを変えてね。
const INITIAL_PATTERN_INDEX = 13; // 最初に現れるパターン。調べたいパターンを先に見たいときにどうぞ。

// 時間表示の設置。
const timeCounter = document.createElement('div');
const updateCounter = document.createElement('div');
const renderCounter = document.createElement('div');
const renderBulletCounter = document.createElement('div');
const renderGunCounter = document.createElement('div');
document.body.appendChild(timeCounter);
document.body.appendChild(updateCounter);
document.body.appendChild(renderCounter);
document.body.appendChild(renderBulletCounter);
document.body.appendChild(renderGunCounter);

function setup(){
  myCanvas = createCanvas(640, 480);
  colorMode(HSB, 100); // hueだけでいろいろ指定出来て便利なので。
  hueSet = [0, 10, 17, 35, 52, 64, 80];
  let initialFlow = initialize(); // 初期化でもろもろ準備して最後に最初のFlowを返す
  all = new entity(); // entityを準備
  all.setFlow(initialFlow); // initialFlowをセットする
  clickPosX = -1;
  clickPosY = -1; // クリックするとpos情報が入る
  keyFlag = 0; // キータイプ情報
  all.activate(); // activate. これですべてが動き出すといいのだけどね。
}

function draw(){
  const start = performance.now();
  all.update();
  all.display();
  const end = performance.now();
  const timeStr = (end - start).toPrecision(4);
  timeCounter.innerText = 'all:' + `${timeStr}ms`;
}

// -------------------------------------------------------------------------------------------------- //
// イニシャライズ。必要なクラスを一通り作ってつなげる。
// とりあえず単純にpauseとパターンだけ。
function initialize(){
  // パターンを増やしても動かすところはどこにもないし、かつ初期パターンも設定できる。
  let patternArray = [];
  let pause = new pauseState();
  for(let i = 0; i < PATTERN_NUM; i++){
    let ptn = new pattern(i);
    patternArray.push(ptn);
    ptn.convertList.push(pause); // すべてのパターン→pause
    pause.convertList.push(ptn); // pause→すべてのパターン
  }
  return patternArray[INITIAL_PATTERN_INDEX];
}

// -------------------------------------------------------------------------------------------------- //

// クリックされたら
function mouseClicked(){
  clickPosX = mouseX;
  clickPosY = mouseY;
}
function keyTyped(){
  if(key === 'q'){ keyFlag |= 1; } // とりあえずQを登録。
}
function flagReset(){
  clickPosX = -1;
  clickPosY = -1; // リセット
  keyFlag = 0;
}

// 簡単なカウンター. resetの名称をsettingにしました。こっちの方がしっくりくるので。
class counter{
  constructor(){
    this.cnt = 0;
    this.limit = -1; // limit復活(-1かあるいは正の数を取る)
  }
  getCnt(){ return this.cnt; }
  getProgress(){ // 進捗
    if(this.limit < 0){ return this.cnt; }
    if(this.cnt >= this.limit){ return 1; }
    return this.cnt / this.limit;
  }
  setting(limit){ // reset → setting.(改名)
    this.cnt = 0;
    this.limit = limit;
  }
  step(diff = 1){ // diffは正の値が前提
    this.cnt += diff;
  }
}
// ----------------------------------------------------------------------------------------------- //
// flow.

// flowは単に処理を書くだけ。つなげることで様々な事を実現する。
// initializeはない場合もあるので省いたよ
class flow{
  constructor(){
    this.convertList = [];
    this.initialState = PRE; // 基本PRE, 内容が単純ならばACTでOK.
  }
  addFlow(_flow){ this.convertList.push(_flow); }
  execute(_actor){ this.convert(_actor); } // デフォルトはconvertだけ（initializeはオプション）
  convert(_actor){
    // デフォルトはランダムコンバート、undefinedがセットされた場合の処理はactorに書く。
    // 初期stateの設定はsetFlowの中に込めてあるのでここにはもう書かない感じ。
    if(this.convertList.length === 0){ _actor.setFlow(undefined); }
    else{
      let n = this.convertList.length;
      _actor.setFlow(this.convertList[randomInt(n)]);
    }
  }
  update(){} // 更新用
  render(gr){} // 描画用
}
// たとえばwaitも、60ならきっかり60フレーム消費にしたいよね。
// 単なるハブはすべて1フレーム処理にしたい。

// コンスタントフローくらいは作ろう。fromからtoへspanフレームで移動.
// 目的はこれにきっかりspanフレームしかかからないようにすること。
// なおcreatureは今までのmovingActorである。カウンター持ってるの。
class constantFlow extends flow{
  constructor(from, to, span){
    super();
    this.from = from;
    this.to = to;
    this.span = span;
    this.initialState = PRE; // timerのsetting.
  }
  initialize(_creature){
    _creature.timer.setting(this.span);
    _creature.setState(ACT);
  }
  execute(_creature){
    if(_creature.state === PRE){ this.initialize(_creature); }
    _creature.timer.step();
    let prg = _creature.timer.getProgress();
    _creature.pos.x = map(prg, 0, 1, this.from.x, this.to.x);
    _creature.pos.y = map(prg, 0, 1, this.from.y, this.to.y);
    if(prg === 1){
      this.convert(_creature);
    }
  }
  render(gr){
    // 矢印を描く
    gr.push();
    gr.strokeWeight(1.0);
    gr.line(this.from.x, this.from.y, this.to.x, this.to.y);
    gr.translate(this.to.x, this.to.y); // 矢印の先っちょへ
    let v = createVector(this.to.x - this.from.x, this.to.y - this.from.y);
    gr.rotate(v.heading()); // vがx軸正方向になる
    gr.line(0, 0, -10, 5);
    gr.line(0, 0, -10, -5);
    gr.pop();
  }
}

// とりあえずassembleHub作ってみる。activeFlowなのでcreate時にあれするのを忘れずに
class assembleHub extends flow{
  constructor(limit){
    super();
    this.volume = 0; // limit個以上集まってるとupdateで開錠され、0だとupdateで施錠される
    this.limit = limit;
    this.open = false;
    this.initialState = PRE;
  }
  execute(_actor){
    if(_actor.state === PRE){ this.volume++; _actor.setState(ACT); }
    // executeでACTになってもそのターンでupdateされたあとでないと通れないので消費は最小で2フレームになるね。
    if(this.open){
      this.convert(_actor);
      this.volume--;
    }
  }
  update(){
    if(this.volume >= this.limit){ this.open = true; }
    else if(this.volume === 0){ this.open = false; }
  }
}

// rotaryHubも作っておこう。順繰りにまわすやつ～
class rotaryHub extends flow{
  constructor(){
    super();
    this.currentIndex = 0;
    this.initialState = ACT;
  }
  execute(_actor){
    _actor.setFlow(this.convertList[this.currentIndex]);
    this.currentIndex = (this.currentIndex + 1) % this.convertList.length;
  } // これだけ。convertするだけのハブは文字通りコンバートを実行しておしまい。簡単だ・・
}

// 指定フレーム待つだけ
class waiting extends flow{
  constructor(spanTime){
    super();
    this.spanTime = spanTime;
    this.initialState = PRE;
  }
  execute(_creature){
    if(_creature.state === PRE){ _creature.timer.setting(this.spanTime); _creature.setState(ACT); }
    _creature.timer.step();
    if(_creature.timer.getCnt() === this.spanTime){ this.convert(_creature); }
  }
}

// ディレイハブ。更新があるのでactiveFlowに入れるの忘れずに。
class delayHub extends flow{
  constructor(interval){
    super();
    this.interval = interval; // 正の数にしないとzero-Division-Errorになっちゃう
    this.open = false;
    this.initialState = ACT;
  }
  execute(_actor){
    if(this.open){ this.convert(_actor); this.open = false; } // 1体ずつ放す
  }
  update(){
    if(frameCount % this.interval === 0){ this.open = true; }
    else{ this.open = false; }
  }
}

// 速度について角度phi1～phi2, 大きさr1～r2を与えて解放する
class randomDelayHub extends delayHub{
  constructor(interval, r1, r2, phi1, phi2){
    super(interval);
    this.r1 = r1;
    this.r2 = r2; // r1 < r2.
    this.phi1 = phi1;
    this.phi2 = phi2; // phi1 < phi2で、この間で大きさrの速度を与える
  }
  execute(_bullet){
    if(this.open){
      let r = this.r1 + random(this.r2 - this.r1);
      let angle = this.phi1 + random(this.phi2 - this.phi1);
      _bullet.setVelocity(r * cos(angle), r * sin(angle));
      this.convert(_bullet);
      this.open = false;
    } // 1体通したら閉じる
  }
}

// 打ち出す方向が等間隔で変わっていくdelayHub.
class circularDelayHub extends delayHub{
  constructor(interval, r1, r2, mainAngle, diffAngle){
    super(interval);
    this.r1 = r1;
    this.r2 = r2;
    this.angle = mainAngle; // 初期射出角度
    this.diffAngle = diffAngle; // 差分（正か負か）
  }
  execute(_bullet){
    if(this.open){
      let r = this.r1 + random(this.r2 - this.r1);
      _bullet.setVelocity(r * cos(this.angle), r * sin(this.angle));
      this.angle += this.diffAngle;
      this.convert(_bullet);
      this.open = false;
    }
  }
}

// Gun用に作り替えよう。まあ、そのうち整理するけどね・・・
// count * intervalだけのタイマーをセットする。limitまでいくとリセット。
// すべてのタイマーは1フレームでセットし終わるので毎フレームの更新などは存在しない。
// これは一度に到達する弾数が限定された状況に特化している。
class limitedDelayHub extends flow{
  constructor(interval, limit){
    super();
    this.interval = interval;
    this.count = 0;
    this.limit = limit;
    this.initialState = PRE;
  }
  setVelocity(_bullet){} // ここに個別の処理を書く
  execute(_bullet){
    if(_bullet.state === PRE){
      this.count++;
      _bullet.timer.setting(this.count * this.interval);
      console.log(_bullet.timer.limit);
      if(this.count === this.limit){
        this.count = 0; // ここをresetとでもして個別の処理を与えるとか？(ごめん勘違いバグでもなんでも無かった)
      }
      this.setVelocity(_bullet);
      _bullet.state = ACT;
    }
    _bullet.timer.step();
    if(_bullet.timer.getCnt() === _bullet.timer.limit){
      this.convert(_bullet);
    }
  }
}

// 直線的に何発かdelayで発射、いわゆるガトリング
class limitedLinearDelayHub extends limitedDelayHub{
  constructor(interval, limit, r1, r2, mainAngle){
    super(interval, limit);
    this.r1 = r1;
    this.r2 = r2;
    this.angle = mainAngle;
  }
  setVelocity(_bullet){
    let r = this.r1 + random(this.r2 - this.r1);
    _bullet.setVelocity(r * cos(this.angle), r * sin(this.angle));
  }
}
// 一定範囲でランダムとかやりたいね
// ウェーブもやりたいね。帰ってから・・いや、今日はすぐ寝るので・・

// 円を描くように発射
class limitedCircularDelayHub extends limitedDelayHub{
  constructor(interval, limit, r1, r2, mainAngle, diffAngle){
    super(interval, limit);
    this.r1 = r1;
    this.r2 = r2;
    this.angle = mainAngle;
    this.diffAngle = diffAngle;
  }
  setVelocity(_bullet){
    let r = this.r1 + random(this.r2 - this.r1);
    _bullet.setVelocity(r * cos(this.angle), r * sin(this.angle));
    this.angle += this.diffAngle;
  }
}

// 一定の範囲の角度で。
// mainは0以上, diff, innerは正にしてください。mainからはじまってdiffずつ方向決めて発射、
// innerだけ進むと折り返します。そんな感じ。
class wavingDelayHub extends delayHub{
  constructor(interval, r1, r2, mainAngle, diffAngle, innerAngle){
    super(interval);
    this.r1 = r1;
    this.r2 = r2;
    this.defaultAngle = mainAngle;
    this.diff = 0;
    this.diffAngle = diffAngle;
    this.innerAngle = innerAngle;
  }
  execute(_bullet){
    if(this.open){
      let r = this.r1 + random(this.r2 - this.r1);
      let n = Math.floor(this.diff / this.innerAngle);
      let angle;
      if(n % 2 === 0){
        angle = this.defaultAngle + (this.diff % this.innerAngle);
      }else{
        angle = this.defaultAngle + this.innerAngle - (this.diff % this.innerAngle);
      }
      _bullet.setVelocity(r * cos(angle), r * sin(angle));
      this.diff += this.diffAngle;
      this.convert(_bullet);
      this.open = false;
    }
  }
}

// homing式のdelayHub. delayのままある特定の対象に向けて方向を定める
class homingDelayHub extends delayHub{
  constructor(interval, r1, r2, targetX, targetY){
    super(interval);
    this.r1 = r1;
    this.r2 = r2;
    this.targetX = targetX;
    this.targetY = targetY;
  }
  execute(_bullet){
    if(this.open){
      let angle = atan2(this.targetY - _bullet.pos.y, this.targetX - _bullet.pos.x);
      let r = this.r1 + random(this.r2 - this.r1);
      _bullet.setVelocity(r * cos(angle), r * sin(angle));
      this.convert(_bullet);
      this.open = false;
    }
  }
  setTarget(newTargetX, newTargetY){
    this.targetX = newTargetX;
    this.targetY = newTargetY;
  }
}

// 位置をセットするだけのハブ
class setPosHub extends flow{
  constructor(x, y){
    super();
    this.x = x;
    this.y = y;
    this.initialState = ACT;
  }
  execute(_creature){
    _creature.setPos(this.x, this.y);
    this.convert(_creature);
  }
}

// 速度をセットするだけのハブ
class setVelocityHub extends flow{
  constructor(vx, vy){
    super();
    this.vx = vx;
    this.vy = vy;
    this.initialState = ACT;
  }
  execute(_bullet){
    _bullet.setVelocity(this.vx, this.vy);
    this.convert(_bullet);
  }
}

// figureModeをチェンジするだけ
class modeChangeHub extends flow{
  constructor(newMode){
    super();
    this.mode = newMode;
    this.initialState = ACT;
  }
  execute(_creature){
    _creature.visual.setVisualMode(this.mode);
    this.convert(_creature);
  }
}

// n_wayHubの移植。
// イメージ的にはmainAngleの方向にnWayGunみたいにして(2n+1)個の速度を順繰りに与えるんだけど、
// その方向にほんとうにnWayShotを撃ちたいのであればmatrixFlowを工夫する必要がある。
// 具体的には行列を然るべき対称行列で与える必要がある。それはmainAngleをθとして、
// [α(cosθ)^2 + β(sinθ)^2, (α-β)cosθsinθ, (α-β)cosθsinθ, α(sinθ)^2 + β(cosθ)^2]ですね。
// これは関数作って成分を出せるようにしましょう。
class n_wayHub extends flow{
  constructor(speed, mainAngle, diffAngle, n){
    super();
    this.directionArray = [];
    let diffVector = createVector(-sin(mainAngle), cos(mainAngle)).mult(speed * tan(diffAngle));
    for(let i = -n; i <= n; i++){
      this.directionArray.push(createVector(speed * cos(mainAngle) + i * diffVector.x, speed * sin(mainAngle) + i * diffVector.y));
    }
    this.currentIndex = 0;
    this.initialState = ACT;
  }
  execute(_bullet){
    let v = this.directionArray[this.currentIndex];
    _bullet.setVelocity(v.x, v.y);
    this.currentIndex = (this.currentIndex + 1) % this.directionArray.length;
    this.convert(_bullet);
  }
}

// arcHub. 文字通り弧を描く。mainAngleから始まってdiffずつn個
// diffAngleを2 * PI / n にすれば円になる
// リボルバーでクラス作るかな・・んー。
// multipleを指定しないと散開弾にならない
class arcHub extends flow{
  constructor(speed, mainAngle, diffAngle, n, multiple = 1){
    super();
    this.directionArray = [];
    for(let i = 0; i < n; i++){
      let angle = mainAngle + i * diffAngle;
      for(let j = 0; j < multiple; j++){
        this.directionArray.push(createVector(speed * cos(angle), speed * sin(angle)));
      }
    }
    this.currentIndex = 0;
    this.initialState = ACT;
  }
  execute(_bullet){
    let v = this.directionArray[this.currentIndex];
    _bullet.setVelocity(v.x, v.y);
    this.currentIndex = (this.currentIndex + 1) % this.directionArray.length;
    this.convert(_bullet);
  }
}

// 行列フロー
class matrixArrow extends flow{
  constructor(a, b, c, d, spanTime = 60){
    super();
    this.elem =  [a, b, c, d];
    this.spanTime = spanTime;
    this.initialState = PRE;
  }
  execute(_bullet){
    if(_bullet.state === PRE){ _bullet.timer.setting(this.spanTime); _bullet.setState(ACT); }
    _bullet.timer.step();
    let vx = _bullet.velocity.x;
    let vy = _bullet.velocity.y;
    _bullet.setVelocity(this.elem[0] * vx + this.elem[1] * vy, this.elem[2] * vx + this.elem[3] * vy);
    _bullet.pos.add(_bullet.velocity);
    if(_bullet.timer.getCnt() === this.spanTime){ this.convert(_bullet); }
    // 画面外に出た場合も終了とする
    if(_bullet.pos.x < -40 || _bullet.pos.x > width + 40 || _bullet.pos.y < -40 || _bullet.pos.y > height + 40){
      this.convert(_bullet);
    }
  }
}

// ----------------------------------------------------------------------------------------------- //
// actor.

// timerは必ずしも必要ではないということで。キー入力がトリガーの場合とか。
class actor{
  constructor(){
    this.currentFlow = undefined;
    this.isActive = false;
    this.state = IDLE;
  }
  activate(){ this.isActive = true; }
  inActivate(){ this.isActive = false; }
  setState(newState){ this.state = newState; }
  setFlow(newFlow){
    if(newFlow === undefined){
      this.setState(IDLE); this.inActivate();
    }else{
      this.setState(newFlow.initialState); // flowが始まるときのstate(PREまたはACT)
    }
    this.currentFlow = newFlow;
  }
  update(){
    if(!this.isActive){ return; } // ここはそのまま
    this.currentFlow.execute(this); // これだけ。すっきりした。
  }
  render(gr){} // 描画用
}

// creature(今までのmovingActor)
class creature extends actor{
  constructor(colorId = 0, figureId = 0){
    super();
    this.timer = new counter();
    this.pos = createVector();
    let myColor = color(hueSet[colorId], 100, 100);
    this.visual = new figure(myColor, figureId);  // 姿かたちを作る。colorに黒も入れたいね。
  }
  setPos(x, y){
    this.pos.set(x, y);
  }
  render(gr){
    this.visual.render(gr, this.pos); // 自分の位置に表示
  }
}

// bulletは速度により位置を更新します
class bullet extends creature{
  constructor(colorId = 0, figureId = 0){
    super(colorId, figureId);
    this.velocity = createVector(0, 0);
  }
  setVelocity(vx, vy){
    this.velocity.set(vx, vy);
  }
  render(gr){
    // rendering関数の上書き。ORIENTEDモードに対応するため。
    this.visual.render(gr, this.pos, this.velocity);
  }
}
// 速度を使って位置を更新する命令は基本的にflow側に書きます。

// そのうちbulletで同じように書くけど今はこれで。
class simpleBullet extends bullet{
  constructor(colorId = 0, figureId = 0){
    super(colorId, figureId);
    this.parent; // 親となるsimpleGun.
  }
  registGun(newGun){
    this.parent = newGun;
  }
  inActivate(){
    // inActivateを上書きして自動的に再装填されるようにする
    this.isActive = false;
    this.visual.setVisualMode(ROLLING); // default.
    this.parent.stock++; // ストック増やしてね
  }
}

// simpleGun. あくまで実験です。
// Zキーを押している間、毎フレーム手持ちのbulletでnon-Activeであるどれかを、setFlow-Activateする感じ。
// あ、ついでにsetPosで自分のposを与えるんだけど。で、十字キーで移動する。renderはシンプルに〇で。
class simpleGun extends actor{
  constructor(x, y, bulletSet, speed = 1){
    super();
    this.pos = createVector(x, y);
    this.speed = speed
    // muzzleは辞書の配列。{initialflow:最初のフロー, wait:次に撃つまでの時間, cost:いくつ使うか, figureId, colorId, mode}
    // modeは要するにROLLINGとか何だっけ・・ORIENTEDとかいうあれ。figureとcolorの情報も入るよね。
    // 他にもガンによってはターゲットの設定とか入りそうだけど。勝手に決まる？
    this.muzzle = []; // ここにflowを登録するみたい。
    this.currentMuzzleIndex = 0;
    this.magazine = bulletSet; // 弾倉。ここにbulletを格納する。
    this.cursor = 0; // non-Activeをどこから調べるかっていう。
    this.wait = 0;
    this.stock = bulletSet.length; // 弾数
  }
  registShot(shot){
    this.muzzle.push(shot); // shotは辞書。
  }
  revolve(){
    // shotの内容を変える(1進める)
    this.currentMuzzleIndex = (this.currentMuzzleIndex + 1) % this.muzzle.length;
  }
  fire(){
    if(this.wait > 0){ return; } // 待ち時間に満たない場合
    let shot = this.muzzle[this.currentMuzzleIndex];
    let n = shot['cost'];
    if(this.stock < n){ return; } // costに相当する弾数が用意されていない場合
    // となるとbullet側が親の(parent)Gunを知っていないといけないからまずいなー
    this.stock -= n;
    while(n > 0){
      if(this.magazine[this.cursor].isActive){
        this.cursor = (this.cursor + 1) % this.magazine.length; // カーソルを進める. こっちに書かないとね。
        continue;
      }
      n--;
      let _bullet = this.magazine[this.cursor];
      _bullet.visual.figureChange(color(hueSet[shot['colorId']], 100, 100), shot['figureId']);
      _bullet.setFlow(shot['initialFlow']);
      _bullet.visual.setVisualMode(shot['mode']);
      _bullet.setPos(this.pos.x, this.pos.y);
      _bullet.registGun(this); // 親を登録
      _bullet.activate(); // used要らない。bullet自身が判断して自分の親のmagazineに戻ればいいだけ。
    }
    this.stock -= n;
    this.wait = shot['wait']; // waitを設定
  }

  update(){
    if(!this.isActive){ return; }
    this.magazine.forEach(function(b){
      if(b.isActive){ b.update(); } // activeなものだけupdateする
    })
    this.currentFlow.execute(this);
    if(this.wait > 0){ this.wait--; } // waitカウントを減らす
  }
  render(gr){
    const start_3 = performance.now();
    this.magazine.forEach(function(b){ if(b.isActive){ b.render(gr); } });
    const end_3 = performance.now();
    const renderBulletStr = (end_3 - start_3).toPrecision(4);
    renderBulletCounter.innerText = 'renderBullet:' + `${renderBulletStr}ms`;

    const start_4 = performance.now();
    gr.push();
    gr.noStroke();
    gr.fill(hueSet[this.currentMuzzleIndex], 50, 100); // shotの内容に応じて色を変える
    // あと、残数分かりやすく
    gr.rect(10, 10, 200 * (this.stock / this.magazine.length), 20);
    gr.translate(this.pos.x, this.pos.y);
    gr.ellipse(0, 0, 30, 30); // とりあえず、円。
    gr.pop();
    const end_4 = performance.now();
    const renderGunStr = (end_4 - start_4).toPrecision(4);
    renderGunCounter.innerText = 'renderGun:' + `${renderGunStr}ms`;

  }
  // muzzleにshotの種類となるflowをregistする関数「registShot」
  // 弾倉にbulletのsetをregistする関数「registBullet」
  // updateは十字キーで動かす。あーそうか、毎フレームupdateするん。。ここには書けないな、どうしよ。
  // 十字キー操作の所だけflow処理にしてこれ自身actor, というかcreatureの継承として書くのもありかもね。
  // また明日考えよ。
  // waitの値を減らしてない。updateに書くか。executeに書く？
}

// TODO:
// まずupdateを上書きしてwaitの値減らすのとbulletの一括アップデートはこっちに書く、
// それからQボタンはフラグ処理にするけどZの方は連射したいからこのままでいい、
// あとrender上書きして左上んとこに残数、というか使えるbulletの個数を表示してください以上です～
// bulletの描画もrenderでactiveなものだけやるようにするとかして工夫。

// simpleGunを操作するためのflow.
class controlGun extends flow{
  constructor(){
    super();
    this.initialState = ACT;
  }
  execute(_gun){
    // 上下左右キーで移動、Qでガン入れ替え、Zで発射
    if(keyIsDown(UP_ARROW)){ _gun.pos.y -= _gun.speed; }
    else if(keyIsDown(DOWN_ARROW)){ _gun.pos.y += _gun.speed; }
    else if(keyIsDown(RIGHT_ARROW)){ _gun.pos.x += _gun.speed; }
    else if(keyIsDown(LEFT_ARROW)){ _gun.pos.x -= _gun.speed; }
    if(_gun.pos.x < 0){ _gun.pos.x = 0; }
    if(_gun.pos.x > width){ _gun.pos = width; }
    if(_gun.pos.y < 0){ _gun.pos.y = 0; }
    if(_gun.pos.y > height){ _gun.pos.y = height; }
    if(keyIsDown(90)){
      // Zボタン
      _gun.fire();
    }
    // Qボタンで切り替え
    if(keyFlag & 1){
      _gun.revolve(); flagReset();
    }
    // あとローテーション付けてディレクション変更とかしたいわね
    // もっともまだテストだし、そのうちいろいろ整理するのでね・・
    // ZとかQならイベントでどうにかできるでしょ。もともとPでポーズやってたわけだし。いけるいける。
    // まあ、また帰ってからぼちぼちやるさ。
  }
}

// executeにfireってあるけどこれでconvertしてもいいかもね。
// つまり、攻撃の準備をflow化してその間のアニメーションとかやってみるっていう。
// それはrender命令に手持ちのflowでレンダリング、って書けば達成できる
// たとえば100発使うなら100フレームかけて準備、その間のアニメーション用意、とか。
// そうすれば1フレームで100発準備しなくて済むからパフォーマンス改善するし。
// 準備が終わったらcontrolGunに戻る、つまり準備中は何もできないってわけ。
// 何が言いたいかというとsimpleGunのfireんとこ長ったらしいから分離したいって話。
// 残りの弾数とかそういうのもcontrolGunの方でバリデーションかけて・・とか。

// もしそれでも動かしたいなら、controlGunのupdateメソッドの方に移動関連のメソッドを書いて、
// それとは別にflowで・・うん、本来はそうするべきよね・・

// ビジュアル担当
class figure{
  constructor(myColor, figureId, visualMode = ROLLING){
    this.myColor = myColor;
    this.figureId = figureId;
    this.graphic = createGraphics(40, 40);
    figure.setGraphic(this.graphic, myColor, figureId);
    this.rotation = 0;
    this.mode = visualMode; // デフォルトはローリング。
  }
  figureChange(newColor, newFigureId){
    // 色と形をチェンジ
    figure.setGraphic(this.graphic, newColor, newFigureId);
  }
  static setGraphic(gr, myColor, figureId){
    // 形のバリエーションは個別のプログラムでやってね
    gr.clear();
    gr.noStroke();
    gr.fill(myColor);
    if(figureId === 0){
      // 正方形
      gr.rect(10, 10, 20, 20);
      gr.fill(255);
      gr.rect(15, 15, 2, 5);
      gr.rect(23, 15, 2, 5);
    }else if(figureId === 1){
      // 星型
      let outer = rotationSeq(0, -12, 2 * PI / 5, 5, 20, 20);
      let inner = rotationSeq(0, 6, 2 * PI / 5, 5, 20, 20);
      for(let i = 0; i < 5; i++){
        let k = (i + 2) % 5;
        let l = (i + 3) % 5;
        gr.quad(outer[i].x, outer[i].y, inner[k].x, inner[k].y, 20, 20, inner[l].x, inner[l].y);
      }
      gr.fill(255);
      gr.rect(15, 17, 2, 5);
      gr.rect(23, 17, 2, 5);
    }else if(figureId === 2){
      // 三角形
      gr.triangle(20, 20 - 24 / Math.sqrt(3), 32, 20 + (12 / Math.sqrt(3)), 8, 20 + (12 / Math.sqrt(3)));
      gr.fill(255);
      gr.rect(15, 17, 2, 5);
      gr.rect(23, 17, 2, 5);
    }else if(figureId === 3){
      // ひしがた
      gr.quad(28, 20, 20, 20 - 10 * Math.sqrt(3), 12, 20, 20, 20 + 10 * Math.sqrt(3));
      gr.fill(255);
      gr.rect(15, 17, 2, 5);
      gr.rect(23, 17, 2, 5);
    }else if(figureId === 4){
      // 六角形
      gr.quad(32, 20, 26, 20 - 6 * Math.sqrt(3), 14, 20 - 6 * Math.sqrt(3), 8, 20);
      gr.quad(32, 20, 26, 20 + 6 * Math.sqrt(3), 14, 20 + 6 * Math.sqrt(3), 8, 20);
      gr.fill(255);
      gr.rect(15, 17, 2, 5);
      gr.rect(23, 17, 2, 5);
    }else if(figureId === 5){
      // なんか頭ちょろってやつ
      gr.ellipse(20, 20, 20, 20);
      gr.triangle(20, 20, 20 - 5 * Math.sqrt(3), 15, 20, 0);
      gr.fill(255);
      gr.rect(15, 17, 2, 5);
      gr.rect(23, 17, 2, 5);
    }else if(figureId === 6){
      // 逆三角形
      gr.triangle(20, 20 + 24 / Math.sqrt(3), 32, 20 - (12 / Math.sqrt(3)), 8, 20 - (12 / Math.sqrt(3)));
      gr.fill(255);
      gr.rect(15, 17, 2, 5);
      gr.rect(23, 17, 2, 5);
    }else if(figureId === 7){
      // デフォルト用の円形
      gr.ellipse(20, 20, 20, 20);
      gr.fill(255);
      gr.rect(15, 17, 2, 5);
      gr.rect(23, 17, 2, 5);
    }
  }
  render(gr, pos, dir = undefined){
    // dirは速度情報、速度でバリエーションしたいときに使う。
    // bulletのrender命令で速度を代入したりとかする。
    gr.push();
    gr.translate(pos.x, pos.y);
    this.rotate(gr, dir);
    gr.image(this.graphic, -20, -20); // 20x20に合わせる
    gr.pop();
  }
  setVisualMode(newMode){
    this.mode = newMode; // とりあえずROLLINGとORIENTEDしか思いつかない
    this.rotation = 0; // ローテーションリセット
  }
  rotate(gr, dir = undefined){
    if(this.mode === ROLLING){ // 回転する
      this.rotation += 0.1;
      gr.rotate(this.rotation);
    }else if(this.mode === ORIENTED){ // 速度の方向に合わせる
      this.rotation = dir.heading() - (PI / 2);
      gr.rotate(this.rotation);
    }
  }
}

// renderの時に回転させるのか、それとも速度ベクトルを90°反対方向に回して描画するのかとかそういうの。

// ----------------------------------------------------------------------------------------------- //
// entity, pattern, pauseを作る。
// entityのin_progressActionとcompletedActionはもうない・・executeにちゃんと書く。
class entity extends actor{
  constructor(){
    super();
    this.currentPatternIndex = INITIAL_PATTERN_INDEX; // 最初のパターンのインデックス
  }
  display(){
    this.currentFlow.display(); // display内容はflowに従ってね
  }
}
// 説明すると、まずupdateはデフォルトでOK.
// completedActionに書いてたやつ、convertはflowの方で、初期stateもflowに書いてある、
// もしflagResetしたいならグローバルでしょ？flowでやればいいじゃん。以上。
// もちろんこっちでやってもいいんだけど一般的じゃないしね・・

// ----------------------------------------------------------------------------------------------- //
// パターンとポーズだけ。

class pattern extends flow{
  constructor(patternIndex){
    super();
    this.patternIndex = patternIndex; // indexに応じてパターンを生成
    this.actors = [];
    this.activeFlow = []; // updateしたいflowをここに入れる
    this.bgLayer = createGraphics(width, height);
    this.objLayer = createGraphics(width, height);
    this.bgLayer.colorMode(HSB, 100);
    this.objLayer.colorMode(HSB, 100);
    this.visited = false; // 最初に来た時にtrueになってそれ以降は再訪してもinitializeが実行されない。
    this.theme = ""; // テーマ名をここに書く（ラベル）
    this.initialState = PRE; // initializeがある
  }
  initialize(_entity){
    _entity.currentPatternIndex = this.patternIndex; // indexの更新
    if(!this.visited){
      createPattern(this.patternIndex, this); // クリエイト、パターン！
      this.bgLayer.textSize(20);
      this.bgLayer.fill(0);
      this.bgLayer.rect(245, 420, 150, 40);
      this.bgLayer.fill(255);
      this.bgLayer.text("TO PAUSE", 270, 450);
      this.visited = true;
    }
    _entity.setState(ACT); // これだけ忘れずに・・・
  }
  execute(_entity){
    if(_entity.state === PRE){ this.initialize(_entity); }

    const start_1 = performance.now();
    this.actors.forEach(function(a){ a.update(); })
    const end_1 = performance.now();
    const updateStr = (end_1 - start_1).toPrecision(4);
    updateCounter.innerText = 'update:' + `${updateStr}ms`;

    this.activeFlow.forEach(function(f){ f.update(); })
    this.objLayer.clear(); // objLayerは毎フレームリセットしてactorを貼り付ける(displayableでなければスルーされる)

    const start_2 = performance.now();
    this.actors.forEach(function(a){ a.render(this.objLayer); }, this)
    const end_2 = performance.now();
    const renderStr = (end_2 - start_2).toPrecision(4);
    renderCounter.innerText = 'render:' + `${renderStr}ms`;

    // 離脱条件はPAUSEのところをクリック
    if(clickPosX > 245 && clickPosX < 395 && clickPosY > 420 && clickPosY < 460){
      this.convert(_entity); // convertするだけ
      flagReset(); // flagのResetはこっちでやる
    }
  }
  convert(_entity){
    // ひとつしかないから簡略化しよう
    _entity.setFlow(this.convertList[0]);
  }
  display(){
    image(this.bgLayer, 0, 0);
    image(this.objLayer, 0, 0);
  }
}

// PAUSE.
// あ、そうか、ランダムコンバートじゃないからコンバート関数上書きしないといけないんだ（馬鹿？）
class pauseState extends flow{
  constructor(){
    super();
    this.bgLayer = createGraphics(width, height);
    //this.objLayer = createGraphics(width, height);
    this.currentPatternIndex = -1; // initializeの際にentityから値を受け取ってconvertの際に更新値を返す感じ
    this.initialState = PRE; // initializeあり
  }
  initialize(_entity){
    //this.bgLayer.clear(); // やめた
    // 現時点でのcanvasの状態をまずレンダリング
    this.bgLayer.image(myCanvas, 0, 0);
    // 次に、グレーのカバーを掛ける
    this.bgLayer.fill(0, 0, 0, 80);
    this.bgLayer.noStroke();
    this.bgLayer.rect(0, 0, width, height);
    // 最後にポーズのテキスト、ここは研究が必要そうね・・
    this.bgLayer.fill(255);
    this.bgLayer.textSize(40);
    this.bgLayer.text("PAUSE", 240, 120);
    this.bgLayer.textSize(20);
    this.bgLayer.text('NEXT PATTERN (CLICK)', 180, 240);
    this.bgLayer.text('PREVIOUS PATTERN (CLICK)', 180, 300);
    // パターンに戻るクリックアクション
    this.bgLayer.fill(0);
    this.bgLayer.rect(245, 420, 150, 40);
    this.bgLayer.fill(255);
    this.bgLayer.text("TO PATTERN", 260, 450);
    this.currentPatternIndex = _entity.currentPatternIndex; // ここで代入
    _entity.setState(ACT);
  }
  patternShift(curId){
    // clickPosYの値に応じてindexの更新とかobjLayerの更新とかする
    if(clickPosY > 240 && clickPosY < 280){ return curId; }
    let newCurId = curId;
    if(clickPosY < 240){ newCurId = (curId + 1) % PATTERN_NUM; }
    else if(clickPosY > 280){ newCurId = (curId + PATTERN_NUM - 1) % PATTERN_NUM; }
    return newCurId;
  }
  execute(_entity){
    if(_entity.state === PRE){ this.initialize(_entity); }
    // クリックでパターン変数をいじる
    if(clickPosX > 180 && clickPosX < 420 && clickPosY > 220 && clickPosY < 300){
      // let newCurId = this.patternShift(_entity.currentPatternIndex);
      this.currentPatternIndex = this.patternShift(this.currentPatternIndex);;
      flagReset();
    }
    // 終了条件は画面下のボタンをクリック
    if(clickPosX > 245 && clickPosX < 395 && clickPosY > 420 && clickPosY < 460){
      this.convert(_entity);
      this.bgLayer.clear(); // ここでclearしないと具合が悪いらしい
      flagReset();
    }
  }
  convert(_entity){
    // ランダムではないのでオーバーライドする
    _entity.currentPatternIndex = this.currentPatternIndex;
    _entity.setFlow(this.convertList[_entity.currentPatternIndex]);
    this.currentPatternIndex = -1; // 初期化～
  }
  display(){
    image(this.bgLayer, 0, 0);
    //image(this.objLayer, 0, 0);
    if(this.currentPatternIndex >= 0){ // 最初だけ描画されないようにする
      push();
      fill(255);
      textSize(20);
      text("CURRENT PATTERN:" + " " + this.currentPatternIndex.toString(), 180, 180);
      pop();
    }
  }
}

// displayとexecuteが似てるな・・
// ----------------------------------------------------------------------------------------------- //

// パターン生成関数
function createPattern(index, _pattern){
  if(index === 0){
    // パターンを記述する
    // 背景を作る
    _pattern.bgLayer.background(0, 30, 100);
    // constantFlowを4つ作る
    let flowSet = [];
    let vecs = getVector([100, 200, 200, 100], [100, 100, 200, 200]);
    flowSet = getConstantFlows(vecs, [0, 1, 2, 3], [1, 2, 3, 0], [50, 50, 50, 50]);
    // patternのbgLayerにrenderする
    renderFlows(_pattern.bgLayer, flowSet);
    // つなげる
    connectFlows(flowSet, [0, 1, 2, 3], [1, 2, 3, 0]);
    // creatureを作る
    let creatureSet = [];
    creatureSet = getCreatures([0, 1, 2, 3], [0, 0, 0, 0]);
    // patternに登録する
    _pattern.actors = creatureSet;
    // flowをセットする
    for(let i = 0; i < 4; i++){ creatureSet[i].setFlow(flowSet[i]); }
    // activateする
    activateAll(creatureSet);
    // テーマを決める
    _pattern.theme = "sample0";
  }else if(index === 1){
    // パターンを記述する
    // 背景を作る
    _pattern.bgLayer.background(80, 30, 100);
    // constantFlowを12個作る
    let flowSet = [];
    let posX = multiSeq(arSeq(100, 100, 3), 3);
    let posY = jointSeq([constSeq(100, 3), constSeq(200, 3), constSeq(300, 3)]);
    let vecs = getVector(posX, posY);
    flowSet = getConstantFlows(vecs, [0, 1, 2, 5, 8, 7, 6, 3, 1, 5, 7, 4], [1, 2, 5, 8, 7, 6, 3, 0, 4, 4, 4, 3], constSeq(50, 12));
    // patternのbgLayerにrenderする
    renderFlows(_pattern.bgLayer, flowSet);
    // つなげる
    connectFlows(flowSet, [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 4, 11, 8, 9, 10], [1, 2, 3, 4, 5, 6, 7, 0, 8, 9, 10, 7, 11, 11, 11]);
    // creatureを作る
    let creatureSet = [];
    creatureSet = getCreatures([0, 1, 2, 3], [0, 0, 0, 0]);
    // patternに登録する
    _pattern.actors = creatureSet;
    // flowをセットする
    let idSet = [0, 4, 11, 7];
    for(let i = 0; i < 4; i++){ creatureSet[i].setFlow(flowSet[idSet[i]]); }
    // activateする
    activateAll(creatureSet);
    // テーマを決める
    _pattern.theme = "sample1";
  }else if(index === 2){
    // assembleHub実験～
    // 背景を作る
    _pattern.bgLayer.background(10, 30, 100);
    // constantFlowを12個作る
    let flowSet = [];
    let posX = arCosSeq(PI / 3, PI / 3, 6, 100, 320);
    let posY = arSinSeq(PI / 3, PI / 3, 6, 100, 240);
    let vecs = getVector(posX, posY);
    vecs.push(createVector(320, 240));  // 中心の座標
    flowSet = getConstantFlows(vecs, [0, 1, 2, 3, 4, 5, 6, 6, 6, 1, 3, 5], [1, 2, 3, 4, 5, 0, 0, 2, 4, 6, 6, 6], constSeq(50, 12));
    // assembleHub.
    flowSet.push(new assembleHub(3)); // 12.
    // registActiveFlow.
    _pattern.activeFlow.push(flowSet[12]); // OK～
    // rotaryHub.
    flowSet.push(new rotaryHub()); // 13.
    // render.
    renderFlows(_pattern.bgLayer, flowSet);
    // connect.
    connectFlows(flowSet, [0, 1, 2, 3, 4, 5, 0, 2, 4, 6, 7, 8, 9, 10, 11, 12, 13, 13, 13], [1, 2, 3, 4, 5, 0, 9, 10, 11, 0, 2, 4, 12, 12, 12, 13, 6, 7, 8]);
    // creature.
    let creatureSet = getCreatures([0, 1, 2], [0, 0, 0]);
    // regist.
    _pattern.actors = creatureSet;
    // setFlow.
    let idSet = [0, 2, 4];
    for(let i = 0; i < 3; i++){ creatureSet[i].setFlow(flowSet[idSet[i]]); }
    // activate.
    activateAll(creatureSet);
  }else if(index === 3){
    // bullet使うー. まずはrandomDelayで乱れ撃ち
    // シナリオとしてはまず位置を設定してランダムディレイで解放しつつマトリックスで直線的にぎゅーんでそのあと戻す
    // 背景
    _pattern.bgLayer.background(40, 30, 100);
    // 3つのflow.
    let flowSet = [];
    flowSet.push(new setPosHub(20, 240));
    flowSet.push(new randomDelayHub(3, 12, 12, -3 * PI / 7, 3 * PI / 7));
    flowSet.push(new matrixArrow(1.01, 0, 0, 0.95, 240));
    // active指定
    _pattern.activeFlow.push(flowSet[1]);
    // connect.
    connectFlows(flowSet, [0, 1, 2], [1, 2, 0]);
    // bullet. (BULLETオプションでbulletを手に入れる)
    let bullets = getCreatures(multiSeq(arSeq(0, 1, 4), 3), constSeq(0, 49), BULLET);
    // regist.
    _pattern.actors = bullets;
    // setFlow.
    bullets.forEach(function(b){ b.setFlow(flowSet[0]); })
    // activate.
    activateAll(bullets);
  }else if(index === 4){
    // waitingはきちんと機能しています。オッケー。
    _pattern.bgLayer.background(45, 30, 100);
    let vecs = getVector([100, 200, 200, 100], [100, 100, 200, 200]);
    let flowSet = getConstantFlows(vecs, [0, 1, 2, 3], [1, 2, 3, 0], [50, 40, 60, 70]);
    flowSet.push(new waiting(60));
    renderFlows(_pattern.bgLayer, flowSet);
    connectFlows(flowSet, [0, 1, 2, 3, 4], [1, 2, 3, 4, 0]);
    // waitingをかませて60フレーム止まらせる
    let creatures = getCreatures([0, 1, 2], [0, 0, 0]);
    _pattern.actors = creatures;
    for(let i = 0; i < 3; i++){ creatures[i].setFlow(flowSet[i]); }
    activateAll(creatures);
  }else if(index === 5){
    // 回転matrixFlow使ってみたいんだけど
    _pattern.bgLayer.background(75, 40, 100);
    let flowSet = [];
    flowSet.push(new setPosHub(320, 240));
    flowSet.push(new delayHub(10));
    flowSet.push(new setVelocityHub(1, 0));
    flowSet.push(new matrixArrow(1.01 * cos(PI / 60), -1.01 * sin(PI / 60), 1.01 * sin(PI / 60), 1.01 * cos(PI / 60), 480));
    _pattern.activeFlow.push(flowSet[1]);
    connectFlows(flowSet, [0, 1, 2, 3], [1, 2, 3, 0]);
    let bullets = getCreatures(multiSeq(arSeq(0, 1, 7), 4), constSeq(0, 28), BULLET);
    _pattern.actors = bullets;
    bullets.forEach(function(b){ b.setFlow(flowSet[0]); })
    activateAll(bullets);
    // らせんぐーるぐーる(？？)
  }else if(index === 6){
    // nWayGun使ってみたいんだけど
    // すげぇ。ほんとに斜めになった。斜めの7WayGunだ。名付けてレインボーガン（？）
    _pattern.bgLayer.background(0, 0, 30);
    let flowSet = [];
    //flowSet.push(new setPosHub(60, 120));
    // ちょっと工夫したい
    flowSet.push(new delayHub(10));
    let vecs = getVector([560, 60, 60], [60, 60, 120]);
    flowSet.push(new constantFlow(vecs[0], vecs[1], 125));
    flowSet.push(new constantFlow(vecs[1], vecs[2], 15));
    flowSet.push(new assembleHub(21)); // とりあえず21で。
    // 下方30°の方向に発射する
    flowSet.push(new n_wayHub(10, PI / 6, PI / 8, 10));
    // その方向に1.01倍、垂直な方向に0.8倍。これでnWayGunになるはず。
    let elem = getSym(1.01, 0.8, PI / 6);
    flowSet.push(new matrixArrow(elem[0], elem[1], elem[2], elem[3], 120));
    _pattern.activeFlow.push(flowSet[0]);
    _pattern.activeFlow.push(flowSet[3]);
    connectFlows(flowSet, [0, 1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 0]);
    let bullets = getCreatures(multiSeq(arSeq(0, 1, 7), 9), constSeq(0, 21), BULLET);
    _pattern.actors = bullets;
    bullets.forEach(function(b){ b.setFlow(flowSet[0]); b.setPos(-100, -100); })
    activateAll(bullets);
    // 完璧だ・・・・・
    // こら何しやがる
  }else if(index === 7){
    // arcHubの確認
    _pattern.bgLayer.background(95, 25, 100);
    let flowSet = [];
    // とりあえず5方向で
    flowSet.push(new setPosHub(20, 240));
    flowSet.push(new assembleHub(25));
    flowSet.push(new setVelocityHub(5, 0));
    flowSet.push(new matrixArrow(1.05, 0, 0, 1.05, 25));
    flowSet.push(new arcHub(5, 0, 2 * PI / 5, 5, 1));
    flowSet.push(new matrixArrow(1.05, 0, 0, 1.05, 10));
    flowSet.push(new arcHub(5, 0, 2 * PI / 5, 5, 5));
    flowSet.push(new matrixArrow(1.02, 0, 0, 1.02, 240));
    _pattern.activeFlow.push(flowSet[1]);
    connectFlows(flowSet, [0, 1, 2, 3, 4, 5, 6, 7], [1, 2, 3, 4, 5, 6 ,7, 0]);
    let bullets = getCreatures(multiSeq(arSeq(0, 1, 5), 5), constSeq(1, 21), BULLET);
    _pattern.actors = bullets;
    bullets.forEach(function(b){ b.setFlow(flowSet[0]); })
    activateAll(bullets);
  }else if(index === 8){
    // circularDelayHubの実験（中央付近までとんでいってばばばばっ（？））
    _pattern.bgLayer.background(60, 40, 100);
    let flowSet = [];
    flowSet.push(new setPosHub(20, 240));
    flowSet.push(new assembleHub(60));
    flowSet.push(new setVelocityHub(20, 0));
    flowSet.push(new matrixArrow(0.99, 0, 0, 0.99, 20));
    flowSet.push(new circularDelayHub(5, 5, 5, 0, PI / 30));
    flowSet.push(new matrixArrow(1.01, 0, 0, 1.01, 240));
    _pattern.activeFlow.push(flowSet[1]);
    _pattern.activeFlow.push(flowSet[4]);
    connectFlows(flowSet, [0, 1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 0]);
    let bullets = getCreatures(multiSeq(arSeq(0, 1, 6), 10), constSeq(1, 60), BULLET);
    _pattern.actors = bullets;
    bullets.forEach(function(b){ b.setFlow(flowSet[0]); })
    activateAll(bullets);
  }else if(index === 9){
    // 5方向に射出してからばばばばっ
    // まずarcHubで5方向、順繰りに1つずつ計100個。で、20個をcurcularDelayでPI / 50の間隔で発射。
    // 若干処理落ち感・・難しい
    _pattern.bgLayer.background(70, 30, 100);
    let flowSet = [];
    flowSet.push(new setPosHub(320, 240));
    flowSet.push(new assembleHub(100));
    flowSet.push(new arcHub(20, 0, 2 * PI / 5, 5, 1));
    flowSet.push(new matrixArrow(0.9, 0, 0, 0.9, 20));
    flowSet.push(new circularDelayHub(1, 6, 6, 0, PI / 50));
    flowSet.push(new matrixArrow(1.01, 0, 0, 1.01, 240));
    _pattern.activeFlow.push(flowSet[1]);
    _pattern.activeFlow.push(flowSet[4]);
    connectFlows(flowSet, [0, 1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 0]);
    let bullets = getCreatures(multiSeq(arSeq(0, 1, 5), 20), constSeq(1, 100), BULLET);
    _pattern.actors = bullets;
    bullets.forEach(function(b){ b.setFlow(flowSet[0]); })
    activateAll(bullets);
  }else if(index === 10){
    // wavingDelayHubの実験
    // すげぇ
    _pattern.bgLayer.background(30, 50, 100);
    let flowSet = [];
    flowSet.push(new setPosHub(20, 240));
    flowSet.push(new wavingDelayHub(2, 4, 6, -PI / 3, PI / 60, 2 * PI / 3));
    flowSet.push(new matrixArrow(1.05, 0, 0, 0.98, 240));
    _pattern.activeFlow.push(flowSet[1]);
    connectFlows(flowSet, [0, 1, 2], [1, 2, 0]);
    let bullets = getCreatures(multiSeq(arSeq(0, 1, 7), 3), constSeq(1, 21), BULLET);
    _pattern.actors = bullets;
    bullets.forEach(function(b){ b.setFlow(flowSet[0]); })
    activateAll(bullets);
  }else if(index === 11){
    // ひし形でモードチェンジ
    // とりあえず直進して、ばばばっと円形に放射してアセンブルさせたのち（36発くらい）
    // delayで特定の方向にばーっととんでいく感じですかね。
    // victimが必要ですねぇ。どうしましょう。
    _pattern.bgLayer.background(40, 60, 100);
    let flowSet = [];
    flowSet.push(new setPosHub(20, 240));
    flowSet.push(new assembleHub(36));
    flowSet.push(new setVelocityHub(2, 0));
    flowSet.push(new matrixArrow(1.1, 0, 0, 1.1, 25));
    flowSet.push(new circularDelayHub(2, 5, 5, 0, PI / 18));
    flowSet.push(new matrixArrow(1.02, 0, 0, 1.02, 10));
    flowSet.push(new assembleHub(36));
    flowSet.push(new homingDelayHub(3, 3, 5, 600, 400));
    flowSet.push(new modeChangeHub(ORIENTED));
    flowSet.push(new matrixArrow(1.05, 0, 0, 1.05, 240));
    flowSet.push(new modeChangeHub(ROLLING));
    _pattern.activeFlow.push(flowSet[1]);
    _pattern.activeFlow.push(flowSet[4]);
    _pattern.activeFlow.push(flowSet[6]);
    _pattern.activeFlow.push(flowSet[7]);
    connectFlows(flowSet, arSeq(0, 1, 11), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0]);
    let bullets = getCreatures(multiSeq(arSeq(0, 1, 6), 6), constSeq(3, 36), BULLET);
    _pattern.actors = bullets;
    bullets.forEach(function(b){ b.setFlow(flowSet[0]); })
    activateAll(bullets);
  }else if(index === 12){
    // 3つに分かれてから行ってみる
    _pattern.bgLayer.background(90, 40, 100);
    let flowSet = [];
    flowSet.push(new setPosHub(20, 240));
    flowSet.push(new assembleHub(108));
    flowSet.push(new arcHub(5, -PI / 3, PI / 3, 3, 1));
    flowSet.push(new matrixArrow(1.02, 0, 0, 1.02, 20));
    flowSet.push(new circularDelayHub(1, 5, 5, 0, PI / 54));
    flowSet.push(new matrixArrow(1.01, 0, 0, 1.01, 15));
    flowSet.push(new assembleHub(108))
    flowSet.push(new homingDelayHub(3, 5, 5, 600, 50));
    flowSet.push(new modeChangeHub(ORIENTED));
    flowSet.push(new matrixArrow(1.1, 0, 0, 1.1, 240));
    flowSet.push(new modeChangeHub(ROLLING));
    _pattern.activeFlow.push(flowSet[1]);
    _pattern.activeFlow.push(flowSet[4]);
    _pattern.activeFlow.push(flowSet[6]);
    _pattern.activeFlow.push(flowSet[7]);
    connectFlows(flowSet, arSeq(0, 1, 11), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0]);
    let bullets = getCreatures(multiSeq(arSeq(0, 1, 6), 18), constSeq(3, 108), BULLET);
    _pattern.actors = bullets;
    bullets.forEach(function(b){ b.setFlow(flowSet[0]); })
    activateAll(bullets);
  }else if(index === 13){
    // やってみる？
    _pattern.bgLayer.background(0, 0, 50);
    // bulletを作る
    let _bullets = [];
    for(let i = 0; i < 200; i++){
      _bullets.push(new simpleBullet());
    }
    let _gun = new simpleGun(20, 240, _bullets, 5);
    let flowSet = [];
    flowSet.push(new setVelocityHub(1, 0));
    //flowSet.push(new setVelocityHub(3, 0));
    flowSet.push(new limitedLinearDelayHub(5, 5, 8, 8, 0));
    flowSet.push(new setVelocityHub(5, 0));
    flowSet.push(new matrixArrow(1.05, 0, 0, 1.05, 480));
    flowSet.push(new matrixArrow(1, 0, 0, 1, 360));
    flowSet.push(new matrixArrow(1.05, 0, 0, -0.98, 240));
    connectFlows(flowSet, [0, 1, 2], [3, 4, 5]);
    _gun.registShot({initialFlow:flowSet[0], wait:10, cost:1, figureId:1, colorId:0, mode:ORIENTED});
    _gun.registShot({initialFlow:flowSet[1], wait:30, cost:5, figureId:2, colorId:1, mode:ORIENTED});
    _gun.registShot({initialFlow:flowSet[2], wait:20, cost:1, figureId:3, colorId:2, mode:ORIENTED});
    // というわけでshot追加します。5WayGunいってみよー
    flowSet.push(new n_wayHub(10, 0, PI / 4, 2));
    flowSet.push(new matrixArrow(1.01, 0, 0, 0.8, 420));
    connectFlows(flowSet, [6], [7]);
    _gun.registShot({initialFlow:flowSet[6], wait:30, cost:5, figureId:3, colorId:3, mode:ORIENTED});
    // いいですね～、じゃあ20発くらい中央までとんでってから円形にディレイでとんでくのやろう。
    flowSet.push(new setVelocityHub(10, 0));
    flowSet.push(new matrixArrow(0.98, 0, 0, 0.98, 30));
    //flowSet.push(new circularDelayHub(5, 4, 4, 0, PI / 10));
    flowSet.push(new limitedCircularDelayHub(5, 20, 4, 4, 0, PI / 10));
    _pattern.activeFlow.push(flowSet[10]);
    flowSet.push(new matrixArrow(1.01, 0, 0, 1.01, 480));
    connectFlows(flowSet, [8, 9, 10], [9, 10, 11]);
    _gun.registShot({initialFlow:flowSet[8], wait:40, cost:20, figureId:4, colorId:4, mode:ROLLING});
    // 処理が止まってしまった・・・
    // 共通のハブ使ってるのが問題なんやね。どうしようか。
    // 順位付けって1フレームの間にやるんでしょ？だったらそのタイミングだけずれてくれれば問題ないよね・・
    // 総数の概念を与える。assembleのlimitのような。今回の場合だと20. で、5だから、
    // タイマーで5ずつずらした値をセットしてやればいいと思う。で、20だからそれでリセットする。
    // うまくいった。
    // 次に、散開するやつやってみたい

    flowSet.push(new setVelocityHub(5, 0));
    flowSet.push(new matrixArrow(1.05, 0, 0, 1.05, 25));
    flowSet.push(new arcHub(5, 0, 2 * PI / 5, 5, 1));
    flowSet.push(new matrixArrow(1.05, 0, 0, 1.05, 10));
    flowSet.push(new arcHub(5, 0, 2 * PI / 5, 5, 5));
    flowSet.push(new matrixArrow(1.02, 0, 0, 1.02, 240));
    connectFlows(flowSet, [12, 13, 14, 15, 16], [13, 14, 15, 16, 17]);
    _gun.registShot({initialFlow:flowSet[12], wait:60, cost:25, figureId:5, colorId:5, mode:ROLLING});

    // 次に、・・・え？
    flowSet.push(new arcHub(20, 0, 2 * PI / 5, 5, 1));
    flowSet.push(new matrixArrow(0.9, 0, 0, 0.9, 10));
    flowSet.push(new limitedCircularDelayHub(1, 100, 6, 6, 0, PI / 50));
    flowSet.push(new matrixArrow(1.01, 0, 0, 1.01, 240));
    connectFlows(flowSet, [18, 19, 20], [19, 20, 21]);
    _gun.registShot({initialFlow:flowSet[18], wait:80, cost:100, figureId:6, colorId:6, mode:ORIENTED});
    // とりあえずテストだしこんなもんでいいや。

    _gun.setFlow(new controlGun());
    _pattern.actors.push(_gun);
    activateAll([_gun]);
    // かなりの確率で処理が止まるので考えないといけないね・・・・
  }
}
// インタラクションのイメージ
// キー入力で上下左右に移動、Qボタンでガンの切り替え、Zボタンで発射。

// ----------------------------------------------------------------------------------------------- //
// パターン生成用の汎用関数

// constantFlowをまとめて手に入れる
function getConstantFlows(vecs, fromIds, toIds, spans){
  let flowSet = [];
  for(let i = 0; i < fromIds.length; i++){
    let _flow = new constantFlow(vecs[fromIds[i]], vecs[toIds[i]], spans[i]);
    flowSet.push(_flow);
  }
  return flowSet;
}

// 面倒なので、idSetのflowにdestinationSetの各flowが登録されるようにした。
function connectFlows(flowSet, idSet, destinationSet){
  for(let i = 0; i < idSet.length; i++){
    flowSet[idSet[i]].addFlow(flowSet[destinationSet[i]]);
  }
}

// graphicにflowをまとめて描画する
function renderFlows(gr, flowSet){
  flowSet.forEach(function(_flow){ _flow.render(gr); })
}

// まとめてcreatureを手に入れる
function getCreatures(colorIds, figureIds, kind = CREATURE){
  let actorSet = [];
  for(let i = 0; i < colorIds.length; i++){
    let _actor;
    if(kind === CREATURE){
      _actor = new creature(colorIds[i], figureIds[i]);
    }else if(kind === BULLET){
      _actor = new bullet(colorIds[i], figureIds[i]);
    }
    actorSet.push(_actor);
  }
  return actorSet;
}

// まとめてactivateする
function activateAll(actorSet){
  actorSet.forEach(function(_actor){ _actor.activate(); })
}

// -------------------------------------------------------------------------------------------------- //
// utility.
function constSeq(c, n){
  // cがn個。
  let array = [];
  for(let i = 0; i < n; i++){ array.push(c); }
  return array;
}

function jointSeq(arrayOfArray){
  // 全部繋げる
  let array = arrayOfArray[0];
  for(let i = 1; i < arrayOfArray.length; i++){
    array = array.concat(arrayOfArray[i]);
  }
  return array;
}

function multiSeq(a, m){
  // arrayがm個
  let array = [];
  for(let i = 0; i < m; i++){ array = array.concat(a); }
  return array;
}

function arSeq(start, interval, n){
  // startからintervalずつn個
  let array = [];
  for(let i = 0; i < n; i++){ array.push(start + interval * i); }
  return array;
}

function arCosSeq(start, interval, n, radius = 1, pivot = 0){
  // startからintervalずつn個をradius * cos([]) の[]に放り込む。pivotは定数ずらし。
  let array = [];
  for(let i = 0; i < n; i++){ array.push(pivot + radius * cos(start + interval * i)); }
  return array;
}

function arSinSeq(start, interval, n, radius = 1, pivot = 0){
  // startからintervalずつn個をradius * sin([]) の[]に放り込む。pivotは定数ずらし。
  let array = [];
  for(let i = 0; i < n; i++){ array.push(pivot + radius * sin(start + interval * i)); }
  return array;
}

function rotationSeq(x, y, angle, n, centerX = 0, centerY = 0){
  // (x, y)をangleだけ0回～n-1回回転させたもののセットを返す(中心はオプション、デフォルトは0, 0)
  let array = [];
  let vec = createVector(x, y);
  array.push(createVector(x + centerX, y + centerY));
  for(let k = 1; k < n; k++){
    vec.set(vec.x * cos(angle) - vec.y * sin(angle), vec.x * sin(angle) + vec.y * cos(angle));
    array.push(createVector(vec.x + centerX, vec.y + centerY));
  }
  return array;
}

function multiRotationSeq(array, angle, n, centerX = 0, centerY = 0){
  // arrayの中身をすべて然るべくrotationしたものの配列を返す
  let finalArray = [];
  array.forEach(function(vec){
    let rotArray = rotationSeq(vec.x, vec.y, angle, n, centerX, centerY);
    finalArray = finalArray.concat(rotArray);
  })
  return finalArray;
}

function commandShuffle(array, sortArray){
  // arrayを好きな順番にして返す。たとえばsortArrayが[0, 3, 2, 1]なら[array[0], array[3], array[2], array[1]].
  let newArray = [];
  for(let i = 0; i < array.length; i++){
    newArray.push(array[sortArray[i]]);
  }
  return newArray; // もちろんだけどarrayとsortArrayの長さは同じでsortArrayは0~len-1のソートでないとエラーになる
}

function reverseShuffle(array){
  // 通常のリバース。
  let newArray = [];
  for(let i = 0; i < array.length; i++){ newArray.push(array[array.length - i - 1]); }
  return newArray;
}

function randomInt(n){
  // 0, 1, ..., n-1のどれかを返す
  return Math.floor(random(n));
}

function getVector(posX, posY){
  let vecs = [];
  for(let i = 0; i < posX.length; i++){
    vecs.push(createVector(posX[i], posY[i]));
  }
  return vecs;
}

// mainAngle方向にa倍、それと直交する方向にb倍する行列の成分を手に入れる。
function getSym(a, b, theta){
  let elem = [];
  elem[0] = a * pow(cos(theta), 2) + b * pow(sin(theta), 2);
  elem[1] = (a - b) * cos(theta) * sin(theta);
  elem[2] = elem[1];
  elem[3] = a * pow(sin(theta), 2) + b * pow(cos(theta), 2);
  return elem;
}
