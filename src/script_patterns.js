'use strict';
// 従来のパターンシークエンスのスクリプト

let all;
//let clickFlag;
let hueSet;

let clickPosX;
let clickPosY;

let myCanvas; // canvasをグローバルにする・・

let pauseFlag = false;

const IDLE = 0; // initialize前の状態
const IN_PROGRESS = 1; // flow実行中の状態
const COMPLETED = 2; // flowが完了した状態

const PATTERN_NUM = 2; // パターン増やすときはここを変えてね。

function setup(){
  myCanvas = createCanvas(640, 480);
  colorMode(HSB, 100); // hueだけでいろいろ指定出来て便利なので。
  hueSet = [0, 10, 17, 35, 52, 64, 80];
  let initialFlow = initialize(); // 初期化でもろもろ準備して最後に最初のFlowを返す
  all = new entity(initialFlow); // それをセットしてentityを準備
  //clickFlag = false; // クリックされるとtrueになり、情報を処理した後でfalseに戻る
  clickPosX = -1;
  clickPosY = -1; // クリックするとpos情報が入る
  all.activate(); // activate. これですべてが動き出すといいのだけどね。
}

function draw(){
  all.update();
  all.display();
}

// 押されたときは何も起こらない。押して離されたときに起きる。
// ほんとうはバリデーションかけてやらないといけないんだけどね・・・いつでもクリック受け付けちゃうと困るから。
function mouseClicked(){
  //clickFlag = true;
  clickPosX = mouseX;
  clickPosY = mouseY;
}

// ここはね、単にクリック受け付けましたっていう風にして、何も起こらなかったらキャンセルするとかしないとなー。
// たとえばクリック位置を記録するとかね。で、convertの時に(-1, -1)に戻すとかしないとね。

// というわけで、
// entityのページ遷移のときのメソッドであるcompletedActionのところにこれを置きました。
// flagが他にもあったらここに追加する感じですかね・・で、これにより、ポーズ中にクリックしても
// ポーズを解除した時次のパターンに移行しなくなります。すげぇ。
// まあ、最終的にはポーズ画面から別のパターンに遷移できるようにしたいんだけどね・・・
function flagReset(){
  //clickFlag = false;
  clickPosX = -1;
  clickPosY = -1; // リセット
}

function keyTyped(){
  if(key === 'p'){ pauseFlag = !pauseFlag; }
}

// 簡単なカウンター
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
  reset(limit){
    this.cnt = 0;
    this.limit = limit;
  }
  step(diff = 1){ // diffは正の値が前提
    this.cnt += diff;
  }
}

class flow{
  constructor(){
    this.index = flow.index++;
    this.convertList = [];
  }
  addFlow(_flow){ this.convertList.push(_flow); }
  initialize(_actor){} // flowの内容に応じて様々な初期化を行います
  execute(_actor){} // デフォルトは何もしない。つまりCOMPLETEDにすらしない。
  convert(_actor){
    let n = this.convertList.length;
    if(n === 0){ _actor.setFlow(undefined); _actor.inActivate(); } // non-Activeにすることでエラーを防ぎます。
    else{ _actor.setFlow(this.convertList[randomInt(n)]); }
  }
  render(gr){} // 貼り付け関数なので名前をrenderにしました。
}

// fromからtoへspanフレーム数で移動するflow.
class constantFlow extends flow{
  constructor(from, to, span){
    super();
    this.from = createVector(from.x, from.y);
    this.to = createVector(to.x, to.y);
    this.span = span;
  }
  initialize(_actor){
    _actor.timer.reset(this.span);
  }
  execute(_actor){
    _actor.timer.step();
    let prg = _actor.timer.getProgress();
    _actor.pos.x = map(prg, 0, 1, this.from.x, this.to.x);
    _actor.pos.y = map(prg, 0, 1, this.from.y, this.to.y);
    if(prg === 1){ _actor.setState(COMPLETED); }
  }
  // grは基本的にbgLayerに描くけどactorに装備されてobjLayerに描くこともあるという。
  render(gr){
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

// 以前のように、多彩なフロー、もしくはハブを追加していくことができる。

// actorはflowをこなすだけの存在
class actor{
  constructor(f = undefined){
    this.index = actor.index++; // 通し番号
    this.currentFlow = f; // 実行中のフロー
    this.timer = new counter(); // カウンター
    this.isActive = false; // updateを実行するか否かを意味する変数
    this.state = IDLE; // 状態変数
  }
  activate(){ this.isActive = true; } // IDLEかつnon-Activeの状態でこれをやると直ちにflowを開始する
  inActivate(){ this.isActive = false; } // 仕組みになっていてシンプルかつ強力なシステムを構築する
  setState(newState){ this.state = newState; } // stateをチェンジする
  setFlow(newFlow){ this.currentFlow = newFlow; } // flowをセットする
  update(){
    if(!this.isActive){ return; } // これが強力。
    if(this.state === IDLE){
      this.idleAction();
    }else if(this.state === IN_PROGRESS){
      this.in_progressAction();
    }else if(this.state === COMPLETED){
      this.completedAction();
    } // これが基本。ここをいろいろカスタマイズする。
  }
  idleAction(){ this.currentFlow.initialize(this); this.setState(IN_PROGRESS); }
  in_progressAction(){ this.currentFlow.execute(this); } // いつCOMPLETEDするかはflowが決める（当然）
  completedAction(){ this.currentFlow.convert(this); this.setState(IDLE); } // convertで次のflowが与えられる
  render(gr){} // sheetに貼り付ける関数
}

// 以下がビジュアルの部分. とりあえずシンプルにいきましょう。
class movingActor extends actor{
  constructor(f = undefined, colorId){
    super(f);
    this.pos = createVector();
    let myColor = color(hueSet[colorId], 100, 100);
    this.visual = new figure(myColor);
  }
  setPos(x, y){
    this.pos.set(x, y);
  }
  getPos(){
    return this.pos;
  }
  render(gr){
    this.visual.render(gr, this.pos); // 自分の位置に表示
  }
}

class figure{
  constructor(myColor){
    this.myColor = myColor;
    this.graphic = createGraphics(40, 40);
    figure.setGraphic(this.graphic, myColor);
    this.rotation = 0; // 動きがないとね。
  }
  static setGraphic(img, myColor){
    // 形のバリエーションは個別のプログラムでやってね
    img.clear();
    img.noStroke();
    img.fill(myColor);
    // 正方形
    img.rect(10, 10, 20, 20);
    img.fill(255);
    img.rect(16, 16, 2, 5);
    img.rect(24, 16, 2, 5);
  }
  render(gr, pos){
    gr.push();
    gr.translate(pos.x, pos.y);
    this.rotation += 0.1; // これも本来はfigureのupdateに書かないと・・基本的にupdate→drawの原則は破っちゃいけない
    gr.rotate(this.rotation);
    gr.image(this.graphic, -20, -20); // 20x20に合わせる
    gr.pop();
  }
}

actor.index = 0;
flow.index = 0;

// -------------------------------------------------------------------------------------------------- //

// 結局entityってflowに従ってパターンを出してるだけね・・ハードウェア的な。
class entity extends actor{
  constructor(f = undefined){
    super(f);
    this.currentPatternIndex = f.patternIndex; // セットされたflowのindexになる。
  }
  in_progressAction(){
    this.currentFlow.execute(this); // execute内容はflowに従ってね
  }
  display(){
    this.currentFlow.display(); // display内容はflowに従ってね
  }
  completedAction(){
    this.currentFlow.convert(this); // convertで次のflowが与えられる
    this.setState(IDLE);
    flagReset(); // フラグをリセットする
  }
}

// -------------------------------------------------------------------------------------------------- //
function initialize(){
  let p0 = new pattern(0);
  let p1 = new pattern(1);
  let pause = new pauseState();
  //p0.convertList = [p1, pause]; // p0 → p1, pause
  //p1.convertList = [p0, pause]; // p1 → p0, pause
  p0.convertList.push(pause);
  p1.convertList.push(pause); // pauseにしか行けないようにする（ワンクリック遷移は廃止）
  pause.convertList = [p0, p1]; // pauseからp0, p1に行ける。原理的にはどこへも行けるのですよ。ハブのような感じ。
  return p0; // そうそう。これをentityにセットする。
}

// これによってたとえばポーズ画面が導入できるようになる。
// つまり、ポーズ画面特有のdisplay方法を使えるって事・・
// 絵空事なんだけど、たとえばね、ボタンPとか？押すと、ポーズに移行。
// 移行するときリセットとかはしない、ただexecuteをやめるだけ（inActivateとも違う）。
// グラフィックはconvertするときにそのデータをポーズ画面stateのグラフィックにrenderingする。
// そしてポーズのinitializeでそこに透明度のあるバックグラウンドを貼り付ける。（HSB100モードなら0, 0, 0, 40くらいで）
// それがポーズstateにおけるbgLayerの代りみたいな感じになって、そのうえでカーソルとか動かす・・
// ポーズstateはすべてのパターンから行くことができすべてのパターンに行くことができる。
// ただしどこから来たのかを記憶していてそのパターンにしかconvertできない。
// といいつつ・・・・
// 実は、ポーズから別のpatternにconvertするシステムも考えている。サムネイル並んでてクリックで・・
// patternごとにactorの集合とbgLayerとobjLayerを与えて、最初に訪れた時だけ
// もろもろ準備する感じ。で、visitedがtrueになる。次に訪れたときはそこでのactorたちが
// 中断させられていたexecuteを再開して再び動き出す感じで。で、visitedがtrueならinitializeはすっとばして・・とか。
// つまりパターンシークエンスにおいてentityはactorやLayerの概念をもたず、それらはすべて
// pauseとpattern持ちにするってこと、まあ一般的ではないかもだけど。内容が既に一般ではないし。
// もしくは・・・
// entityにもbgLayerやobjLayerを持たせておいて・・んー？？でもなぁ。

// というわけでやめました。entityがスカスカに・・いいのか、これ。

class pattern extends flow{
  constructor(patternIndex){
    super();
    this.patternIndex = patternIndex; // indexに応じてパターンを生成
    this.actors = [];
    this.bgLayer = createGraphics(width, height);
    this.objLayer = createGraphics(width, height);
    this.bgLayer.colorMode(HSB, 100);
    this.objLayer.colorMode(HSB, 100);
    this.visited = false; // 最初に来た時にtrueになってそれ以降は再訪してもinitializeが実行されない。
  }
  initialize(_entity){
    _entity.currentPatternIndex = this.patternIndex; // indexの更新
    if(!this.visited){
      createPattern(this.patternIndex, this);
      this.visited = true;
    }
  }
  execute(_entity){
    this.actors.forEach(function(a){ a.update(); })
    this.objLayer.clear(); // objLayerは毎フレームリセットしてactorを貼り付ける(displayableでなければスルーされる)
    this.actors.forEach(function(a){ a.render(this.objLayer); }, this)
    if(pauseFlag){ _entity.setState(COMPLETED); }
    // one-click-convertは廃止
    //else if(clickFlag){ _entity.setState(COMPLETED); clickFlag = false; } // クリックしたらパターンチェンジ、の表現
  }
  display(){
    image(this.bgLayer, 0, 0);
    image(this.objLayer, 0, 0);
  }
  convert(_entity){
    if(pauseFlag){
      //this.convertList[1].preRender(this.bgLayer, this.objLayer) // preRendering, これによりカバーが掛けられる
      _entity.currentFlow = this.convertList[0];
    } // 1番がpause.
    //else{ _entity.currentFlow = this.convertList[0]; } // 0番が次。
    //_entity.reset(); // 移るときはリセット, しない？
  }
}

class pauseState extends flow{
  constructor(){
    super();
    this.bgLayer = createGraphics(width, height);
    this.objLayer = createGraphics(width, height);
  }
  //preRender(gr1, gr2){} // やめた
  initialize(_entity){
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
  }
  display(_entity){
    // displayでそれを描画するんだけど、何かしたいとき、たとえばobjLayerも用意して何かしらのオブジェクトを
    // 動かすとか、あるいは普通にカーソルの位置情報の変更とかしたいんだったらobjLayerも用意して、
    // executeで然るべくキー操作を受け付けていろいろやる必要があるけどね。
    image(this.bgLayer, 0, 0);
    image(this.objLayer, 0, 0);
  }
  execute(_entity){
    // というわけでポーズ中に何かしたいときはここに書いてね！
    if(clickPosX > 180 && clickPosX < 420 && clickPosY > 220 && clickPosY < 300){
      let curId = _entity.currentPatternIndex;
      console.log(curId);
      if(clickPosY < 240){ curId = (curId + 1) % PATTERN_NUM; }
      else if(clickPosY > 280){ curId = (curId + PATTERN_NUM - 1) % PATTERN_NUM; }
      _entity.currentPatternIndex = curId;
      clickPosX = -1; clickPosY = -1;
    }
    // 変化させるところはobjLayerに書いてね
    this.objLayer.clear();
    this.objLayer.fill(255);
    this.objLayer.textSize(20);
    this.objLayer.text("CURRENT PATTERN:" + " " + _entity.currentPatternIndex.toString(), 180, 180);
    if(!pauseFlag){ _entity.setState(COMPLETED); } // pボタンでポーズ解除
  }
  convert(_entity){
    this.bgLayer.clear();
    // pauseStateのconvertListは0, 1, 2の順にすべてのpatternがindex順で入ってるからそれを呼び出すだけ
    _entity.currentFlow = this.convertList[_entity.currentPatternIndex];
    // なんだけど、多分このままだと・・んー。
  }
}

// ----------------------------------------------------------------------------------------------- //

// パターン生成関数
function createPattern(index, _pattern){
  if(index === 0){
    // パターンを記述（横3, 縦2の一般的な格子）
    _pattern.bgLayer.background(0, 30, 100);
    let posX = multiSeq(arSeq(100, 100, 4), 3);
    let posY = jointSeq([constSeq(100, 4), constSeq(200, 4), constSeq(300, 4)]);
    let vecs = getVector(posX, posY);
    let flowSet = getConstantFlows(vecs, [0, 1, 2, 4, 1, 2, 3, 5, 6, 7, 8, 9, 10, 7, 9, 10, 11], [1, 2, 3, 0, 5, 6, 7, 4, 5, 6, 4, 5, 6, 11, 8, 9, 10], constSeq(40, 17));
    connectFlows(flowSet, [4, 8, 11, 5, 9, 12, 7, 3, 14, 10, 0, 15, 1, 16, 2, 6, 13], [[7], [7], [7], [8], [8], [8], [3], [0], [10], [3], [1, 4], [11, 14], [2, 5], [12, 15], [6], [9, 13], [16]]);
    renderFlows(_pattern.bgLayer, flowSet);
    let actorSet = getActors(flowSet, [0, 7, 14], [0, 1, 2]);
    _pattern.actors = actorSet;
    activateAll(actorSet);
  }else if(index === 1){
    // パターンを記述
    _pattern.bgLayer.background(40, 30, 100);
    let posX = multiSeq(arSeq(100, 100, 4), 3);
    let posY = jointSeq([constSeq(200, 4), constSeq(300, 4), constSeq(400, 4)]);
    let vecs = getVector(posX, posY);
    let flowSet = getConstantFlows(vecs, [0, 1, 2, 4, 1, 2, 3, 5, 6, 7, 8, 9, 10, 7, 9, 10, 11], [1, 2, 3, 0, 5, 6, 7, 4, 5, 6, 4, 5, 6, 11, 8, 9, 10], constSeq(70, 17));
    connectFlows(flowSet, [4, 8, 11, 5, 9, 12, 7, 3, 14, 10, 0, 15, 1, 16, 2, 6, 13], [[7], [7], [7], [8], [8], [8], [3], [0], [10], [3], [1, 4], [11, 14], [2, 5], [12, 15], [6], [9, 13], [16]]);
    renderFlows(_pattern.bgLayer, flowSet);
    let actorSet = getActors(flowSet, [0, 7, 14], [0, 1, 2]);
    _pattern.actors = actorSet;
    activateAll(actorSet);
  }
}

function getConstantFlows(vecs, fromIds, toIds, spans){
  // constantFlowをまとめてゲットだぜ
  let flowSet = [];
  for(let i = 0; i < fromIds.length; i++){
    let _flow = new constantFlow(vecs[fromIds[i]], vecs[toIds[i]], spans[i]);
    flowSet.push(_flow);
  }
  return flowSet;
}
// flowの登録関数は今までと同じようにいくらでも増やすことができる。
// 今までと同じようにグローバルの関数として。
function connectFlows(flowSet, idSet, destinationSet){
  // idSetの各idのflowにdestinationSetの各flowIdSetに対応するflowが登録される（はずだぜ）
  for(let i = 0; i < idSet.length; i++){
    destinationSet[i].forEach(function(id){ flowSet[idSet[i]].convertList.push(flowSet[id]); })
  }
}
function renderFlows(gr, flowSet){
  // graphicにflowをまとめて描画だぜ
  flowSet.forEach(function(_flow){ _flow.render(gr); })
}
function getActors(flows, flowIds, colorIds){
  // まとめてactorゲットだぜ（スピードが必要なら用意する）（あ、あとfigureIdほしいです）（ぜいたく～～）
  let actorSet = [];
  for(let i = 0; i < flowIds.length; i++){
    let _actor = new movingActor(flows[flowIds[i]], colorIds[i]);
    actorSet.push(_actor);
  }
  return actorSet;
}
function setActorPoses(vecs, vecIds, actorSet){
  for(let i = 0; i < vecs.length; i++){ actorSet[i].setPos(vecs[vecIds[i]]); }
}
function activateAll(actorSet){
  actorSet.forEach(function(_actor){ _actor.activate(); })
}

// -------------------------------------------------------------------------------------------------- //
// utility.
function typeSeq(typename, n){
  // typenameの辞書がn個。
  let array = [];
  for(let i = 0; i < n; i++){ array.push({type: typename}); }
  return array;
}

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
