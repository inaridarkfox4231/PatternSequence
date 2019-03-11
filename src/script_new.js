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
let myCanvas;

const IDLE = 0;
const PRE = 1;
const ACT = 2;

const ROLLING = 0;  // figureの描画モード、回転
const ORIENTED = 1; // figureの描画モード、指向

// やってみるかー
const PATTERN_NUM = 1; // パターン増やすときはここを変えてね。
const INITIAL_PATTERN_INDEX = 0; // 最初に現れるパターン。調べたいパターンを先に見たいときにどうぞ。

function setup(){
  myCanvas = createCanvas(640, 480);
  colorMode(HSB, 100); // hueだけでいろいろ指定出来て便利なので。
  hueSet = [0, 10, 17, 35, 52, 64, 80];
  let initialFlow = initialize(); // 初期化でもろもろ準備して最後に最初のFlowを返す
  all = new entity(); // entityを準備
  all.setFlow(initialFlow); // initialFlowをセットする
  clickPosX = -1;
  clickPosY = -1; // クリックするとpos情報が入る
  all.activate(); // activate. これですべてが動き出すといいのだけどね。
}

function draw(){
  all.update();
  all.display();
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
function flagReset(){
  clickPosX = -1;
  clickPosY = -1; // リセット
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

// flowは単に処理を書くだけ。つなげることで様々な事を実現する。
class flow{
  constructor(){
    this.convertList = [];
    this.initialState = IDLE;
  }
  addFlow(_flow){ this.convertList.push(_flow); }
  initialize(_actor){} // initializeは普通にあるよ
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

// コンスタンスフローくらいは作ろう。fromからtoへspanフレームで移動.
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
    //console.log("render");
    this.visual.render(gr, this.pos); // 自分の位置に表示
  }
}

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
    //console.log("render");
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
  }
  rotate(gr, dir = undefined){
    if(this.mode === ROLLING){
      this.rotation += 0.1;
      gr.rotate(this.rotation);
    }else if(this.mode = ORIENTED){
      this.rotation = dir - (PI / 2);
      gr.rotate(this.rotation);
    }
  }
}

// renderの時に回転させるのか、それとも速度ベクトルを90°反対方向に回して描画するのかとかそういうの。

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
    this.actors.forEach(function(a){ a.update(); })
    this.activeFlow.forEach(function(f){ f.update(); })
    this.objLayer.clear(); // objLayerは毎フレームリセットしてactorを貼り付ける(displayableでなければスルーされる)
    this.actors.forEach(function(a){ a.render(this.objLayer); }, this)
    // 離脱条件はPAUSEのところをクリック
    if(clickPosX > 245 && clickPosX < 395 && clickPosY > 420 && clickPosY < 460){
      this.convert(_entity); // convertするだけ
      flagReset(); // flagのResetはこっちでやる
    }
  }
  display(){
    image(this.bgLayer, 0, 0);
    image(this.objLayer, 0, 0);
  }
}

// PAUSE.
class pauseState extends flow{
  constructor(){
    super();
    this.bgLayer = createGraphics(width, height);
    this.objLayer = createGraphics(width, height);
    this.initialState = PRE; // initializeあり
  }
  initialize(_entity){
    this.bgLayer.clear(); // 最初にクリアします（こっちに移動した）
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
    // objLayerにデフォルトの状態を描画しておく
    this.objLayer.clear(); // もちろん！
    this.objLayer.fill(255);
    this.objLayer.textSize(20);
    this.objLayer.text("CURRENT PATTERN:" + " " + _entity.currentPatternIndex.toString(), 180, 180);
    _entity.setState(ACT);
  }
  patternShift(curId){
    // clickPosYの値に応じてindexの更新とかobjLayerの更新とかする
    if(clickPosY > 240 && clickPosY < 280){ return curId; }
    let newCurId = curId;
    if(clickPosY < 240){ newCurId = (curId + 1) % PATTERN_NUM; }
    else if(clickPosY > 280){ newCurId = (curId + PATTERN_NUM - 1) % PATTERN_NUM; }
    this.objLayer.clear();
    this.objLayer.fill(255);
    this.objLayer.textSize(20);
    this.objLayer.text("CURRENT PATTERN:" + " " + newCurId.toString(), 180, 180);
    return newCurId;
  }
  execute(_entity){
    if(_entity.state === PRE){ this.initialize(_entity); }
    // クリックでパターン変数をいじる
    if(clickPosX > 180 && clickPosX < 420 && clickPosY > 220 && clickPosY < 300){
      let newCurId = this.patternShift(_entity.currentPatternIndex);
      _entity.currentPatternIndex = newCurId;
      flagReset();
    }
    if(clickPosX > 245 && clickPosX < 395 && clickPosY > 420 && clickPosY < 460){
      this.convert(_entity);
      flagReset();
    }
  }
  display(_entity){
    image(this.bgLayer, 0, 0);
    image(this.objLayer, 0, 0);
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
    connectFlows(flowSet, [0, 1, 2, 3], [[1], [2], [3], [0]]);
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
    _pattern.theme = "sample1";
  }
}

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

// idSetの各idのflowにdestinationSetの各flowIdSetに対応するflowが登録される（はずだぜ）
function connectFlows(flowSet, idSet, destinationSet){
  for(let i = 0; i < idSet.length; i++){
    destinationSet[i].forEach(function(id){ flowSet[idSet[i]].convertList.push(flowSet[id]); })
  }
}

// graphicにflowをまとめて描画する
function renderFlows(gr, flowSet){
  flowSet.forEach(function(_flow){ _flow.render(gr); })
}

// まとめてcreatureを手に入れる
function getCreatures(colorIds, figureIds){
  let actorSet = [];
  for(let i = 0; i < colorIds.length; i++){
    let _actor = new creature(colorIds[i], figureIds[i]);
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