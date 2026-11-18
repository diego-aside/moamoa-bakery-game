/* 모아모아베이커리: 오늘의 빵집 — 데이터 파일
 * 메뉴·재료 카드·손님·대사는 모두 이 파일에서만 관리한다.
 * 새 메뉴 추가 방법: BREADS 배열에 항목을 하나 더하고 open: true 로 두면 끝.
 *   - 필수: id, cat, name, desc, open, wish, hint, actions, ingredients, decoy, art
 *   - actions 는 'knead' | 'shape' | 'bake' 중 2~3개 (순서대로 진행)
 *   - shape 가 있으면 shapeKind: 'stretch'(길게 늘리기) | 'pan'(틀에 넣기)
 *   - art: 'saltbread' | 'loaf' | 'roll' (그림 종류. 사진이 생기면 PHOTOS 에 등록)
 * 잠긴 메뉴는 id, cat, name, open:false 만 있으면 도감에 '곧 만나요'로 보인다.
 * 이 파일에는 재료의 양·온도·시간 같은 숫자를 쓰지 않는다.
 */
(function () {
  'use strict';

  var STORE = {
    name: '모아모아베이커리 2호점',
    address: '안양 동안구 관악대로 255 CS타워 202호'
  };

  var CATS = [
    { id: 'salt', name: '소금빵' },
    { id: 'loaf', name: '식빵·바게트' },
    { id: 'filled', name: '속재료 빵' },
    { id: 'baked', name: '구움과자' },
    { id: 'etc', name: '케이크·기타' }
  ];

  var BREADS = [
    {
      id: 'rice-salt', cat: 'salt', name: '쌀소금빵', open: true,
      desc: '겉은 바삭, 속은 쫄깃해요.',
      wish: ['겉은 바삭하고 속은 쫄깃한 빵 있어요?', '짭조름하고 고소한 빵이 당겨요.'],
      hint: '쌀소금빵',
      actions: ['shape', 'bake'], shapeKind: 'stretch', art: 'saltbread',
      ingredients: [
        { id: 'rice', icon: '🌾', name: '쌀가루', why: '쌀로 빚어 겉은 바삭, 속은 쫄깃하게' },
        { id: 'sbutter', icon: '🧈', name: '소금버터', why: '짭조름한 끝맛이 빵의 고소함을 살려줘요' },
        { id: 'milk', icon: '🥛', name: '우유', why: '촉촉하게 빚어주는 재료예요' },
        { id: 'yeast', icon: '🫧', name: '효모', why: '빵이 폭신하게 부풀도록 도와줘요' }
      ],
      decoy: { id: 'basil', icon: '🌿', name: '바질', why: '다른 빵에 어울리는 재료예요' }
    },
    {
      id: 'rice-loaf', cat: 'loaf', name: '쌀식빵(아기쌀식빵)', open: true,
      desc: '부드럽게 씹혀요.',
      wish: ['아이가 먹을 거라 부드러운 빵이면 좋겠어요.', '폭신하게 씹히는 빵으로 주세요.'],
      hint: '쌀식빵',
      actions: ['knead', 'shape', 'bake'], shapeKind: 'pan', art: 'loaf',
      ingredients: [
        { id: 'rice', icon: '🌾', name: '쌀가루', why: '부드럽게 씹혀 아이도 먹기 편하게' },
        { id: 'milk', icon: '🥛', name: '우유', why: '촉촉하게 빚어주는 재료예요' },
        { id: 'yeast', icon: '🫧', name: '효모', why: '빵이 폭신하게 부풀도록 도와줘요' }
      ],
      decoy: { id: 'chestnut', icon: '🌰', name: '밤', why: '다른 빵에 어울리는 재료예요' }
    },
    { id: 'mocha-salt', cat: 'salt', name: '모카소금빵', open: false },
    { id: 'mentai-salt', cat: 'salt', name: '명란소금빵', open: false },
    { id: 'chestnut-loaf', cat: 'loaf', name: '보늬밤 쌀식빵', open: false },
    { id: 'chestnut-baguette', cat: 'loaf', name: '보늬밤 그릭바게트', open: false },
    { id: 'basil-sausage', cat: 'filled', name: '바질 쌀소세지빵', open: false },
    { id: 'rice-castella', cat: 'baked', name: '쌀카스테라', open: false },
    { id: 'rice-scone', cat: 'baked', name: '쌀스콘·에그스콘', open: false },
    { id: 'choco-soboro', cat: 'baked', name: '초코 소보로', open: false },
    { id: 'financier', cat: 'baked', name: '휘낭시에', open: false },
    { id: 'canele', cat: 'baked', name: '까눌레', open: false },
    { id: 'madeleine', cat: 'baked', name: '마들렌', open: false },
    { id: 'cheesecake', cat: 'etc', name: '치즈케이크', open: false },
    { id: 'mochi', cat: 'etc', name: '모찌', open: false },
    { id: 'gimbap', cat: 'etc', name: '김밥', open: false },
    { id: 'sandwich', cat: 'etc', name: '샌드위치', open: false }
  ];

  /* 단골 4종 — 말투는 고정. {wish} 자리에 빵 주문 문장이 들어간다.
   * 대사는 맛·식감·기분 범위 안에서만 쓴다. */
  var CUSTOMERS = [
    {
      id: 'halmoni', name: '단골 할머니', tag: '동네 단골',
      look: { skin: '#F1D2B6', hair: '#D8D6D2', hairStyle: 'bun', cloth: '#8E6AA8', extra: 'glasses' },
      greet: '안녕하세요, 오늘도 왔어요.',
      order: '{wish} 허허, 있으려나 모르겠네요.',
      reaction: {
        1: '조금 아쉽지만 괜찮아요. 다음엔 더 정성껏 부탁해요.',
        2: '맛있네요. 고소해서 자꾸 손이 가요.',
        3: '겉바속촉이 딱 좋아요! 내일 또 올게요!'
      }
    },
    {
      id: 'mom', name: '아이와 온 엄마', tag: '아이 손 잡고',
      look: { skin: '#F4D9C2', hair: '#5A3B2A', hairStyle: 'ponytail', cloth: '#E58E7A', extra: 'child' },
      greet: '안녕하세요! 아이랑 같이 왔어요.',
      order: '아이가 먹을 거예요. {wish}',
      reaction: {
        1: '아이가 조금 더 부드러운 걸 좋아해요. 다음엔 다시 부탁해요.',
        2: '아이가 맛있게 먹어요. 고마워요!',
        3: '아이가 두 손으로 들고 먹어요! 내일 또 올게요!'
      }
    },
    {
      id: 'worker', name: '출근길 직장인', tag: '아침 단골',
      look: { skin: '#EBC6A6', hair: '#2A2A2E', hairStyle: 'short', cloth: '#3C5A7A', extra: 'bag' },
      greet: '좋은 아침이에요. 출근길에 들렀어요.',
      order: '빨리 가야 해서요. {wish}',
      reaction: {
        1: '오늘은 조금 아쉽네요. 내일 다시 들를게요.',
        2: '좋은 하루가 시작될 것 같아요. 잘 먹을게요.',
        3: '기분 좋은 아침이 됐어요! 내일 또 올게요!'
      }
    },
    {
      id: 'window', name: '창가 바 단골', tag: '창가 자리',
      look: { skin: '#F0CDB0', hair: '#7A4A2A', hairStyle: 'beanie', cloth: '#345433', extra: 'phones' },
      greet: '안녕하세요. 창가 자리 비어 있죠?',
      order: '창가에 앉아서 먹을 거예요. {wish}',
      reaction: {
        1: '음, 다음엔 조금 더 맛있게 부탁해요.',
        2: '창밖 보면서 먹기 딱 좋아요.',
        3: '오늘 빵 정말 맛있어요! 내일 또 올게요!'
      }
    }
  ];

  /* 채점 말 — 숫자 없이 말로만 */
  var WORDS = {
    ingredient: ['꼼꼼해요', '대체로 잘 골랐어요', '조금 헷갈렸어요'],
    knead: { hi: '찰지게 잘 치댔어요', low: '조금 덜 치댔어요', over: '조금 질겨졌어요' },
    shape: { hi: '모양이 예쁘게 잡혔어요', mid: '모양이 대체로 잡혔어요', low: '모양이 조금 삐뚤어졌어요' },
    bake: { hi: '겉바속촉이에요', early: '조금 덜 구워졌어요', late: '겉이 조금 진해졌어요' }
  };

  var TITLES = [
    { name: '빵집 손님', need: 0 },
    { name: '단골', need: 6 },
    { name: '모아모아 단골', need: 18 },
    { name: '빵집 친구', need: 36 }
  ];

  var TEXT = {
    gameTitle: '모아모아베이커리',
    gameSub: '오늘의 빵집',
    notice: '이 게임의 순서는 재미를 위한 연출이며, 실제 레시피가 아니에요.',
    allergy: '알레르기가 있으면 매장에 문의해 주세요.',
    deviceDate: '날짜는 기기 날짜를 기준으로 해요.'
  };

  /* 사진 자리: 매장 사용 동의가 확인되면 { scene-home: 'img/home.jpg' } 처럼 등록하면
   * 해당 그림 대신 사진이 쓰인다. 지금은 모두 비워 둔다(CSS·SVG 도형 사용). */
  var PHOTOS = {};

  window.MOAMOA_DATA = {
    STORE: STORE, CATS: CATS, BREADS: BREADS, CUSTOMERS: CUSTOMERS,
    WORDS: WORDS, TITLES: TITLES, TEXT: TEXT, PHOTOS: PHOTOS
  };
})();
