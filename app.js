/* =========================================================================
   하트 라떼점 · Heart Latte Fortune — app.js
   OGOG WebApp Developers Skill 기준 구현
   - Bridge ready 대기 후 세션 초기화 (participation.getState)
   - execution.report START / COMPLETE (서버 응답 기준으로만 남은 기회 반영)
   - 쿠폰: 데모 화면 안내만 제공 (실제 쿠폰 발급 연동 전)
   - 공유(친구에게 자랑하기): share.requestKakao (리워드 없음)
   - ES2017 문법 / optional chaining·nullish 미사용 / raw storage·window.open 미사용
   ========================================================================= */
(function () {
  "use strict";

  /* ------------------------- 상태 ------------------------- */
  var state = {
    bridge: null,
    participation: { remainingCount: null, playable: null },
    specialCouponSharedToday: false,
    specialCouponShareBusy: false,
    extraChanceAdBusy: false,
    // pour
    pouring: false,
    canPour: false,
    poured: false,
    pourStartTs: 0,
    gameStartTs: 0,
    level: 0,
    layerCount: 0,
    totalHeldMs: 0,
    continuousSizeStep: 0,
    rafId: 0,
    dragging: false,
    pointerId: null,
    x: 0, y: 0,
    targetX: 0, targetY: 0,
    lastX: 0, lastY: 0,
    lastMoveTs: 0,
    totalDistance: 0,
    totalRotation: 0,
    lastAngle: null,
    directionReversals: 0,
    lastDirSign: 0,
    tail: 0,
    tailPull: 0,
    selectedPositionIndex: 1,
    selectedSizeIndex: 1,
    selectedTailIndex: 0,
    lockedCupX: 0,
    lockedCupY: 0,
    controlPhase: -1,
    moved: false,
    playPhase: -1,
    playAsset: "",
    lastArtSwapTs: 0
  };

  var EVENT_PERIOD = "9/1~9/30";
  /* 첫 동작 후 6초: 세 가지 제스처를 동시에 조절한다. */
  var PLAY_MS = 6000;
  var MIN_LAYER_MS = 180;
  var SIZE_CHANGE_MS = 1250;
  var MAX_LAYERS = 4;
  var NO_POUR_CALLOUT_MS = 2500;
  var EXTRA_CHANCE_AD_PLACEMENT_ID = "heart-latte-extra-play-interstitial";
  var EXTRA_CHANCE_AD_FLOW_ID = "heart-latte-extra-play";
  var SPECIAL_COUPON_SHARE_FLOW_ID = "heart-latte-special-coupon-share";

  /* file://로 직접 열었을 때에도, 시안 검수용 게임 루프는 완전히 동작해야 한다. */
  function isPreviewMode() {
    return window.location.protocol === "file:" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  }

  /* 위치 3 × 크기 3 × 꼬리 3 = 27개. 컵과 크레마는 모든 결과에서 동일하다. */
  var HEART_POSITIONS = [
    { key: "left", label: "왼쪽", x: 405 },
    { key: "center", label: "가운데", x: 545 },
    { key: "right", label: "오른쪽", x: 685 }
  ];
  var HEART_SIZES = [
    { key: "small", label: "작은", scale: 0.56 },
    { key: "medium", label: "중간", scale: 0.76 },
    { key: "large", label: "큰", scale: 0.94 }
  ];
  var HEART_TAILS = [
    { key: "short", label: "짧은 꼬리", end: 185 },
    { key: "medium", label: "중간 꼬리", end: 225 },
    { key: "long", label: "긴 꼬리", end: 270 }
  ];
  /* 각 하트 결과마다 title/summary/문구를 통째로 담은 항목 100개 중 하나를 무작위로 노출한다. */
  var FORTUNE_SETS = {"single-0": [{"title": "첫마음 미니 하트", "summary": "작은 시작이 반가운 날", "tip": "미뤄둔 일 중 가장 가벼운 것 하나만 골라 천천히 시작해보세요. 작은 완료가 오늘의 자신감을 자연스럽게 키워줄 거예요.", "cup": "창가나 조용한 자리에서 첫 커피를 마시며 오늘 하고 싶은 일을 하나 떠올려보세요."}, {"title": "새싹 미니 하트", "summary": "조용히 뿌리내리는 날", "tip": "눈에 띄지 않아도 꾸준히 해온 일이 있다면, 오늘 한 번 더 이어가 보세요. 작은 반복이 곧 단단한 뿌리가 됩니다.", "cup": "익숙한 원두로 내린 커피 한 잔이 오늘의 리듬을 잡아줄 거예요."}, {"title": "소망 미니 하트", "summary": "바라던 것에 다가서는 날", "tip": "마음에 품고만 있던 바람을 오늘은 소리 내어 말해보세요. 말로 꺼낸 소망은 이루어질 확률이 조금 더 높아집니다.", "cup": "연한 라떼 한 모금과 함께 오늘의 바람을 조용히 되새겨보세요."}, {"title": "고요한 하트 한 방울", "summary": "쉼표가 필요한 날", "tip": "모든 일을 한 번에 해결하려 하지 마세요. 오늘은 딱 하나만 처리해도 충분히 잘한 하루입니다.", "cup": "평소보다 천천히, 커피의 온도가 식어가는 순간까지 음미해보세요."}, {"title": "작은 용기 하트", "summary": "한 걸음이면 충분한 날", "tip": "망설이던 연락이나 제안이 있다면 짧게라도 시도해보세요. 생각보다 가벼운 마음으로 시작할 수 있어요.", "cup": "쓴맛이 강하지 않은 커피로 부담 없이 하루를 열어보세요."}, {"title": "조용한 다짐 하트", "summary": "나만 아는 결심의 날", "tip": "거창하지 않아도 괜찮아요. 오늘 스스로에게 한 작은 다짐 하나가 다음 걸음의 방향을 정해줄 거예요.", "cup": "혼자만의 시간에 커피 한 잔을 마시며 다짐을 마음속으로 적어보세요."}], "single-1": [{"title": "한 모금 하트", "summary": "마음이 가벼워지는 날", "tip": "복잡하게 생각하던 일은 잠시 내려두고, 지금 바로 할 수 있는 선택부터 해보세요. 가벼운 한 걸음이 좋은 흐름을 만들어요.", "cup": "평소 자주 마시던 메뉴를 편안하게 골라보세요. 익숙한 맛이 마음을 안정적으로 잡아줄 거예요."}, {"title": "산책 하트", "summary": "천천히 걸어도 되는 날", "tip": "오늘은 목적지보다 과정을 즐겨보세요. 서두르지 않아도 결국 도착하게 되어 있어요.", "cup": "테이크아웃 커피 한 잔을 들고 가까운 거리를 걸어보세요."}, {"title": "느긋한 하트", "summary": "여유가 스며드는 날", "tip": "할 일 목록에서 하나쯤은 내일로 미뤄도 괜찮아요. 오늘의 여유가 내일의 효율을 만듭니다.", "cup": "부드러운 라떼 한 잔과 함께 잠깐 눈을 감고 숨을 골라보세요."}, {"title": "편안한 마음 하트", "summary": "긴장이 스르르 풀리는 날", "tip": "완벽하지 않아도 괜찮다는 걸 오늘 한 번 더 스스로에게 말해주세요. 편안한 마음이 더 좋은 결과로 이어집니다.", "cup": "좋아하는 향의 커피를 고르고 그 향에 잠시 집중해보세요."}, {"title": "잔잔한 물결 하트", "summary": "작은 평화가 찾아오는 날", "tip": "소란스러운 마음이 있다면 잠시 멈춰서 숨을 세 번 크게 쉬어보세요. 생각보다 빨리 가라앉을 거예요.", "cup": "따뜻한 음료를 두 손으로 감싸 쥐고 온기를 느껴보세요."}, {"title": "안정된 하트 한 잔", "summary": "흔들림 없이 걷는 날", "tip": "오늘은 새로운 시도보다 익숙한 방식으로 하루를 채워도 좋아요. 안정감이 자신감을 만들어줍니다.", "cup": "늘 마시던 커피로 하루의 기준점을 잡아보세요."}], "single-2": [{"title": "포근한 하트", "summary": "다정함이 돌아오는 날", "tip": "오늘 고마웠던 사람에게 짧게라도 안부를 전해보세요. 당신의 다정한 마음이 예상보다 따뜻한 답으로 돌아올 수 있어요.", "cup": "달콤한 디저트나 부드러운 라떼처럼 기분을 느슨하게 해주는 한 잔을 즐겨보세요."}, {"title": "먼저 건네는 하트", "summary": "작은 친절이 퍼지는 날", "tip": "먼저 건넨 미소와 인사가 좋은 기운을 불러올 거예요. 마음을 표현해보세요.", "cup": "우유 거품이 부드러운 라떼로 포근한 휴식을 만들어보세요."}, {"title": "귀 기울이는 하트", "summary": "다정함이 서로에게 남는 날", "tip": "오늘은 가까운 사람의 이야기를 조금 더 천천히 들어주세요. 다정함이 서로에게 오래 남습니다.", "cup": "작은 디저트와 커피를 나누며 편안한 대화를 시작해보세요."}, {"title": "온기 나눔 하트", "summary": "따뜻함이 배가 되는 날", "tip": "받은 친절을 그대로 흘려보내지 말고 누군가에게 다시 전해보세요. 온기는 나눌수록 커집니다.", "cup": "따뜻한 커피 두 잔을 준비해 옆자리 동료에게도 건네보세요."}, {"title": "안부 하트", "summary": "연락이 반가운 날", "tip": "뜸했던 사람에게 안부 한 줄을 보내보세요. 예상보다 반가운 답장이 기다리고 있을 수 있어요.", "cup": "커피를 마시며 오랜만에 통화를 시도해보는 것도 좋아요."}, {"title": "공감하는 하트", "summary": "이해받는 기분이 드는 날", "tip": "누군가의 고민에 해결책 대신 공감을 먼저 건네보세요. 오늘은 그게 더 큰 위로가 됩니다.", "cup": "부드러운 라떼처럼 말투도 한결 부드럽게 만들어보세요."}], "single-3": [{"title": "가득 채운 하트", "summary": "서두르지 않아도 되는 날", "tip": "망설였던 일에 작은 용기를 내보세요. 완벽하게 준비되지 않아도, 지금의 진심이 좋은 결과를 향해 움직이게 해줄 거예요.", "cup": "좋아하는 사람과 커피 한 잔 약속을 잡아보세요. 함께 마시는 시간이 오늘을 더 풍성하게 만들어요."}, {"title": "여유로운 하트 가득", "summary": "마음까지 넉넉해지는 날", "tip": "하루가 꽉 차 보이더라도 마음까지 급하게 몰아가지 마세요. 나만의 속도가 가장 좋습니다.", "cup": "조금 여유 있는 시간에 좋아하는 커피를 천천히 즐겨보세요."}, {"title": "칭찬받는 하트", "summary": "스스로를 인정해도 되는 날", "tip": "지금까지 해온 일을 스스로 칭찬해보세요. 충분히 잘하고 있다는 믿음이 다음 선택을 밝혀줍니다.", "cup": "커피 한 잔을 들고 오늘의 좋은 순간을 하나 떠올려보세요."}, {"title": "채워진 하루 하트", "summary": "부족함이 느껴지지 않는 날", "tip": "오늘 하루 애쓴 스스로에게 작은 보상을 주세요. 그 보상이 다음 날의 동력이 되어줄 거예요.", "cup": "평소보다 조금 더 특별한 메뉴를 골라 나에게 선물해보세요."}, {"title": "넉넉한 하트 한 잔", "summary": "베풀고 싶어지는 날", "tip": "가진 것을 나누는 데 인색해지지 마세요. 오늘의 나눔이 예상보다 큰 기쁨으로 돌아옵니다.", "cup": "커피값을 대신 계산해주는 작은 호의를 베풀어보세요."}, {"title": "차오르는 하트", "summary": "자신감이 차오르는 날", "tip": "작게 시작한 일이 어느새 제법 자리를 잡았을 거예요. 그 성장을 스스로 알아채 주세요.", "cup": "진한 커피 한 잔으로 오늘의 성취를 자축해보세요."}, {"title": "든든한 하트", "summary": "믿는 구석이 생기는 날", "tip": "혼자가 아니라는 사실을 오늘 새삼 느끼게 될 거예요. 주변의 도움을 편하게 받아들여보세요.", "cup": "누군가 건넨 커피 한 잔의 온기를 그대로 느껴보세요."}], "double-0": [{"title": "두 번 피어난 하트", "summary": "함께라서 더 따뜻한 날", "tip": "혼자 해결하려 했던 고민을 믿을 만한 사람에게 가볍게 꺼내보세요. 다른 시선이 생각지 못한 실마리를 건네줄 거예요.", "cup": "커피를 마시며 최근 연락이 뜸했던 사람에게 안부 메시지를 보내보세요."}, {"title": "조용한 동행 하트", "summary": "말없이 힘이 되는 날", "tip": "굳이 말하지 않아도 곁에 있어주는 것만으로 충분한 순간이 있어요. 오늘은 그런 하루가 될 거예요.", "cup": "둘이서 조용히 커피 한 잔을 나누는 시간을 가져보세요."}, {"title": "작은 신뢰 하트", "summary": "믿음이 조용히 쌓이는 날", "tip": "큰 약속보다 작은 약속을 지키는 것이 신뢰를 만듭니다. 오늘 한 가지 약속만 잘 지켜보세요.", "cup": "함께 마시기로 한 커피 약속을 먼저 제안해보세요."}, {"title": "은은한 짝 하트", "summary": "잔잔한 케미가 빛나는 날", "tip": "굳이 맞추려 애쓰지 않아도 자연스럽게 맞아떨어지는 순간이 올 거예요. 힘을 빼고 함께해보세요.", "cup": "평소와 같은 자리에서 같은 사람과 커피를 마셔보세요."}, {"title": "고요한 협력 하트", "summary": "조용히 손발이 맞는 날", "tip": "말이 많지 않아도 오늘은 손발이 척척 맞을 거예요. 함께하는 일을 자연스럽게 나눠보세요.", "cup": "업무 사이 짧은 커피 타임에 다음 할 일을 가볍게 나눠보세요."}, {"title": "차분한 둘 하트", "summary": "서두르지 않는 관계의 날", "tip": "관계도 속도가 있어요. 오늘은 천천히 가까워져도 괜찮다는 걸 기억해보세요.", "cup": "조용한 카페에서 천천히 대화를 나눠보는 시간을 가져보세요."}], "double-1": [{"title": "겹친 하트", "summary": "마음의 균형을 찾는 날", "tip": "해야 할 일과 쉬는 시간을 모두 챙겨보세요. 한쪽에만 치우치지 않는 선택이 오늘의 리듬을 가장 편안하게 만들어줄 거예요.", "cup": "점심 뒤 잠깐의 커피 휴식을 가져보세요. 창밖을 보며 숨을 고르면 오후가 한결 가벼워져요."}, {"title": "저울 하트", "summary": "균형이 스스로 맞춰지는 날", "tip": "무리하게 애쓰지 않아도 오늘은 자연스럽게 균형이 맞춰질 거예요. 흐름에 몸을 맡겨보세요.", "cup": "진한 커피와 순한 커피를 번갈아 마시며 균형을 즐겨보세요."}, {"title": "양손 가득 하트", "summary": "일과 쉼을 함께 쥐는 날", "tip": "하나를 포기하지 않아도 괜찮아요. 오늘은 두 가지를 모두 챙길 수 있는 여유가 있습니다.", "cup": "커피 한 잔과 간단한 간식을 함께 즐겨보세요."}, {"title": "편안한 짝 하트", "summary": "긴장 없이 마주하는 날", "tip": "오늘의 만남은 편안하게 흘러갈 거예요. 준비한 말보다 자연스러운 대화가 더 좋은 결과를 만듭니다.", "cup": "익숙한 카페에서 편안한 마음으로 상대를 기다려보세요."}, {"title": "안정된 균형 하트", "summary": "흔들려도 다시 중심을 잡는 날", "tip": "잠시 흔들리는 순간이 와도 금방 중심을 되찾을 수 있어요. 스스로를 믿어보세요.", "cup": "따뜻한 라떼 한 잔으로 마음의 온도를 다시 맞춰보세요."}, {"title": "두 갈래 하트", "summary": "선택의 무게가 가벼워지는 날", "tip": "고민하던 두 가지 선택지 중 마음이 먼저 기우는 쪽을 따라가도 좋아요. 직감이 힌트를 줄 거예요.", "cup": "커피를 마시며 두 선택지를 종이에 적어 비교해보세요."}], "double-2": [{"title": "다정한 더블 하트", "summary": "다정한 말이 복이 되는 날", "tip": "주변 사람의 작은 수고를 알아봐 주고, 칭찬 한마디를 건네보세요. 당신의 말이 상대에게 오래 남는 힘이 될 수 있어요.", "cup": "따뜻한 음료를 들고 가까운 사람과 짧은 대화를 나눠보세요. 부담 없는 이야기가 좋은 기억이 됩니다."}, {"title": "고맙다는 말 하트", "summary": "표현이 관계를 가깝게 하는 날", "tip": "오늘은 먼저 고맙다고 말해보세요. 짧은 표현 하나가 관계를 더 가깝게 합니다.", "cup": "커피를 함께 고르며 상대가 좋아하는 맛을 물어보세요."}, {"title": "퍼지는 다정함 하트", "summary": "좋은 말이 멀리 가는 날", "tip": "다정한 말은 생각보다 멀리 퍼집니다. 주변의 좋은 점을 하나 찾아 전해보세요.", "cup": "따뜻한 라떼 한 잔처럼 부드러운 말투로 하루를 채워보세요."}, {"title": "함께 웃는 하트", "summary": "웃음이 잦아지는 날", "tip": "가벼운 농담이나 밝은 이야기가 오늘의 분위기를 살려줄 거예요. 부담 갖지 말고 먼저 웃어보세요.", "cup": "카페에서 편안한 사람과 시시콜콜한 이야기를 나눠보세요."}, {"title": "살펴주는 하트", "summary": "작은 배려가 통하는 날", "tip": "상대가 미처 챙기지 못한 부분을 슬쩍 도와주세요. 티 내지 않은 배려일수록 더 크게 기억됩니다.", "cup": "동료의 커피 취향을 기억해두었다가 슬쩍 챙겨보세요."}, {"title": "다감한 하트", "summary": "마음이 자주 오가는 날", "tip": "짧은 메시지나 안부 하나로도 충분해요. 오늘은 마음을 자주 표현할수록 좋습니다.", "cup": "커피 사진 한 장과 함께 소소한 안부를 전해보세요."}, {"title": "살가운 하트", "summary": "곁을 내주고 싶어지는 날", "tip": "오늘은 평소보다 조금 더 곁을 내어줘도 좋아요. 그 다정함이 관계를 한층 편안하게 만들어줄 거예요.", "cup": "동료와 커피를 나누며 요즘 근황을 가볍게 물어보세요."}], "double-3": [{"title": "풍성한 겹 하트", "summary": "좋은 인연이 이어지는 날", "tip": "새로운 제안이나 약속이 생긴다면 가볍게 응해보세요. 오늘의 낯선 선택이 반가운 인연과 즐거운 경험으로 이어질 수 있어요.", "cup": "평소 고르지 않던 메뉴를 한 번 시도해보세요. 작은 변화가 기분 좋은 활력을 더해줄 거예요."}, {"title": "이어지는 인연 하트", "summary": "우연이 반가운 만남이 되는 날", "tip": "우연히 이어진 대화를 소중히 해보세요. 좋은 인연은 사소한 관심에서 시작됩니다.", "cup": "새로운 원두나 메뉴를 골라 작은 변화를 즐겨보세요."}, {"title": "열린 마음 하트", "summary": "따뜻한 연결이 기다리는 날", "tip": "오늘 만나는 사람에게 열린 마음을 보여주세요. 예상보다 따뜻한 연결이 기다리고 있을 수 있어요.", "cup": "커피 한 잔을 핑계로 가벼운 약속을 잡아보세요."}, {"title": "풍요로운 만남 하트", "summary": "약속이 즐거운 날", "tip": "오늘 생기는 약속은 부담보다 즐거움이 클 거예요. 흔쾌히 응해보세요.", "cup": "새로운 사람과의 만남을 커피 한 잔으로 편하게 시작해보세요."}, {"title": "넓어지는 인연 하트", "summary": "관계의 폭이 넓어지는 날", "tip": "낯선 자리라도 오늘은 한 걸음 다가가 보세요. 생각보다 반가운 인연으로 이어질 수 있어요.", "cup": "처음 가보는 카페에서 새로운 분위기를 즐겨보세요."}, {"title": "함께 나누는 하트", "summary": "나눔이 배가 되어 돌아오는 날", "tip": "가진 정보나 기회를 주변과 나눠보세요. 나눈 만큼 더 큰 것이 되어 돌아올 거예요.", "cup": "커피 두 잔을 사서 하나는 동료에게 건네보세요."}], "tulip-0": [{"title": "세 겹 미니 하트", "summary": "새로운 기회가 피어나는 날", "tip": "아직 눈에 띄지 않는 노력도 포기하지 말고 한 번 더 이어가 보세요. 차곡차곡 쌓인 시간이 곧 당신만의 든든한 결과가 됩니다.", "cup": "집중이 필요한 시간 전에는 진한 커피 한 잔을 천천히 즐겨보세요. 나만의 시작 신호가 되어줄 거예요."}, {"title": "조용한 준비 하트", "summary": "보이지 않는 곳에서 자라는 날", "tip": "당장 결과가 없어도 괜찮아요. 오늘의 준비가 다음 기회를 위한 밑거름이 되고 있습니다.", "cup": "조용한 자리에서 커피 한 잔과 함께 다음 계획을 정리해보세요."}, {"title": "싹트는 기회 하트", "summary": "작은 신호를 알아채는 날", "tip": "평소라면 그냥 지나쳤을 작은 신호를 오늘은 눈여겨보세요. 뜻밖의 기회로 이어질 수 있어요.", "cup": "새로운 정보를 접할 때 커피 한 잔의 여유를 곁들여보세요."}, {"title": "고요한 도전 하트", "summary": "소리 없이 나아가는 날", "tip": "요란하게 알리지 않아도 오늘의 도전은 충분히 의미가 있어요. 묵묵히 이어가 보세요.", "cup": "향이 진한 커피로 집중력을 끌어올려보세요."}, {"title": "기초를 다지는 하트", "summary": "단단한 바탕을 만드는 날", "tip": "화려한 진전보다 기본을 다지는 하루가 필요해요. 오늘은 기초 작업에 시간을 들여보세요.", "cup": "평소보다 여유 있게 커피를 내리며 마음의 속도를 늦춰보세요."}, {"title": "작은 씨앗 하트", "summary": "기대를 심어두는 날", "tip": "지금 심는 작은 씨앗이 나중에 어떤 모습으로 자랄지는 아무도 몰라요. 일단 심어보는 것으로 충분합니다.", "cup": "새로운 아이디어가 떠오르면 커피와 함께 메모해두세요."}], "tulip-1": [{"title": "차곡차곡 하트", "summary": "나다운 선택이 빛나는 날", "tip": "오늘은 결과를 서두르기보다 과정에서 잘한 점을 하나씩 찾아보세요. 스스로를 인정하는 마음이 다음 걸음을 더 단단하게 만들어요.", "cup": "커피를 마신 뒤 오늘의 작은 성취를 한 줄로 기록해보세요. 나중에 다시 봐도 기분 좋은 선물이 됩니다."}, {"title": "내 속도 하트", "summary": "남과 비교하지 않는 날", "tip": "남들의 속도보다 내 리듬을 믿어보세요. 차근차근 고른 선택이 오래갑니다.", "cup": "조용한 자리에서 커피를 마시며 오늘의 우선순위를 정리해보세요."}, {"title": "쌓이는 성취 하트", "summary": "작은 성취가 힘이 되는 날", "tip": "작은 성취를 그냥 지나치지 마세요. 오늘 쌓인 한 걸음이 분명한 힘이 됩니다.", "cup": "커피와 함께 체크리스트 하나를 가볍게 지워보세요."}, {"title": "안정적인 걸음 하트", "summary": "흔들리지 않는 하루", "tip": "주변의 소음에 흔들리지 말고 오늘 할 일에만 집중해보세요. 안정적인 걸음이 결국 더 빠릅니다.", "cup": "익숙한 커피 한 잔으로 집중 모드를 켜보세요."}, {"title": "편안한 성장 하트", "summary": "애쓰지 않아도 자라는 날", "tip": "억지로 밀어붙이지 않아도 오늘의 노력은 자연스럽게 쌓이고 있어요. 마음을 편하게 가져보세요.", "cup": "부드러운 라떼 한 잔처럼 오늘 하루도 부드럽게 흘려보내 보세요."}, {"title": "믿음의 하트", "summary": "스스로를 믿어도 되는 날", "tip": "결과가 바로 보이지 않아도 지금까지의 선택을 믿어보세요. 방향은 이미 잘 잡혀 있습니다.", "cup": "커피 한 잔의 여유 속에서 지금까지의 과정을 돌아보세요."}], "tulip-2": [{"title": "여운이 남는 하트", "summary": "기대해도 좋은 날", "tip": "마음속에 남아 있던 말을 부드럽게 전해보세요. 솔직하지만 다정한 표현이 관계의 공기를 한층 편안하게 바꿔줄 거예요.", "cup": "향이 좋은 커피를 고르고, 마시는 동안 휴대폰을 잠시 내려놓아 보세요. 나에게 집중하는 시간이 필요해요."}, {"title": "설레는 하트", "summary": "작은 기대가 하루를 밝히는 날", "tip": "기대하는 마음을 숨기지 않아도 좋아요. 작은 설렘이 하루를 더 선명하게 합니다.", "cup": "휴대폰을 잠시 내려두고 커피의 온기와 향에만 집중해보세요."}, {"title": "오래 남는 하트", "summary": "좋은 순간을 붙잡는 날", "tip": "좋았던 순간의 여운을 붙잡아보세요. 그 마음이 다음 만남을 더 반갑게 만들어줄 거예요.", "cup": "향긋한 커피 한 잔을 천천히 마시며 오늘의 기분을 느껴보세요."}, {"title": "다정한 기대 하트", "summary": "좋은 소식을 예감하는 날", "tip": "막연한 기대라도 오늘은 믿어봐도 좋아요. 예감이 현실이 되는 순간이 가까워지고 있어요.", "cup": "평소보다 조금 특별한 커피로 오늘을 기념해보세요."}, {"title": "따뜻한 여운 하트", "summary": "마음에 오래 남는 대화의 날", "tip": "짧은 대화라도 진심을 담으면 오래 기억에 남습니다. 오늘은 진심을 담아 말해보세요.", "cup": "좋아하는 사람과 커피 한 잔을 나누며 근황을 나눠보세요."}, {"title": "기대되는 하트", "summary": "내일이 궁금해지는 날", "tip": "오늘 뿌린 씨앗이 내일 어떤 모습일지 기대해보세요. 궁금증이 하루를 더 즐겁게 만들어줍니다.", "cup": "새로운 시즌 메뉴를 시도해보며 작은 설렘을 느껴보세요."}], "tulip-3": [{"title": "깊어진 하트", "summary": "천천히 자라는 좋은 소식", "tip": "중요한 선택 앞에서는 타인의 속도보다 내 마음의 방향을 먼저 살펴보세요. 충분히 생각한 선택이라면 천천히 가도 괜찮아요.", "cup": "조용한 카페 자리에서 커피 한 잔과 함께 다음 주의 계획을 가볍게 정리해보세요."}, {"title": "천천히 익는 하트", "summary": "조급함을 내려놓는 날", "tip": "좋은 소식은 때로 천천히 자랍니다. 조급함 대신 지금 할 수 있는 준비에 집중해보세요.", "cup": "깊은 향의 커피와 함께 차분한 시간을 만들어보세요."}, {"title": "한 번 더 보는 하트", "summary": "신중한 선택이 빛나는 날", "tip": "한 번 더 들여다본 선택이 더 오래 마음에 남을 거예요. 오늘은 서두르지 않아도 됩니다.", "cup": "창가 자리에서 커피를 마시며 먼 곳을 바라보는 여유를 가져보세요."}, {"title": "깊이 있는 하트", "summary": "본질에 집중하는 날", "tip": "겉모습보다 본질을 들여다보는 하루를 보내보세요. 깊이 있는 시선이 좋은 답을 찾아줄 거예요.", "cup": "평소보다 진한 커피로 생각의 밀도를 높여보세요."}, {"title": "단단해진 하트", "summary": "흔들림 끝에 자리 잡는 날", "tip": "그동안의 고민이 오늘은 단단한 결론으로 자리 잡을 거예요. 스스로의 판단을 믿어보세요.", "cup": "좋아하는 커피 한 잔으로 결심을 축하해보세요."}, {"title": "성숙한 하트", "summary": "한층 자란 나를 만나는 날", "tip": "예전 같으면 흔들렸을 상황에서 오늘은 의연하게 대처할 수 있을 거예요. 성장을 스스로 느껴보세요.", "cup": "익숙한 카페에서 나만의 속도로 커피를 즐겨보세요."}, {"title": "여물어가는 하트", "summary": "결실을 앞둔 날", "tip": "오랫동안 준비해온 일이 곧 결실을 맺을 거예요. 마지막까지 힘을 빼지 말고 이어가 보세요.", "cup": "평소보다 정성 들여 내린 커피 한 잔으로 스스로를 응원해보세요."}], "bouquet-0": [{"title": "몽글 하트", "summary": "기분 좋은 마무리가 있는 날", "tip": "오늘 받은 친절을 다음 사람에게 자연스럽게 이어주세요. 작은 배려가 돌아 돌아 당신의 하루에도 기분 좋은 온기를 남길 거예요.", "cup": "고마운 사람에게 먼저 전화를 걸거나 음성 메시지를 남겨보세요. 짧은 안부만으로도 마음이 가까워집니다."}, {"title": "차분한 완성 하트", "summary": "조용히 마무리되는 날", "tip": "마무리할 일이 있다면 너무 크게 생각하지 말고 한 가지부터 정리해보세요. 마음도 함께 가벼워질 거예요.", "cup": "달콤한 커피나 디저트로 오늘의 수고를 다정하게 마무리해보세요."}, {"title": "소소한 나눔 하트", "summary": "작은 안부가 오래 남는 날", "tip": "오늘의 좋은 기분을 누군가와 나누면 더 오래 남습니다. 짧은 안부도 충분해요.", "cup": "좋아하는 사람에게 커피 사진 한 장과 함께 안부를 전해보세요."}, {"title": "은은한 완결 하트", "summary": "고요히 매듭짓는 날", "tip": "요란하지 않아도 괜찮아요. 오늘은 조용히 마무리하는 것 자체로 충분한 하루입니다.", "cup": "하루의 끝에 향이 편안한 커피 한 잔을 내려보세요."}, {"title": "잔잔한 만족 하트", "summary": "작은 만족이 쌓이는 날", "tip": "큰 성과가 아니어도 괜찮아요. 오늘 느낀 작은 만족을 있는 그대로 인정해보세요.", "cup": "평소보다 조금 더 오래 커피 향을 음미해보세요."}, {"title": "평온한 마무리 하트", "summary": "애쓰지 않아도 잘 끝나는 날", "tip": "억지로 애쓰지 않아도 오늘 하루는 자연스럽게 잘 마무리될 거예요. 힘을 빼보세요.", "cup": "조용한 저녁, 카페인 없는 따뜻한 음료로 하루를 정리해보세요."}], "bouquet-1": [{"title": "행운이 쌓인 하트", "summary": "행운이 한 겹 더 쌓이는 날", "tip": "눈앞의 작은 기회를 가볍게 흘려보내지 말고 한 번 더 들여다보세요. 평범해 보였던 제안이 의외의 행운으로 자랄 수 있어요.", "cup": "커피를 마시며 오늘 좋았던 순간을 하나 떠올려보세요. 그 기분을 누군가와 나누면 행운이 더 커집니다."}, {"title": "숨은 징조 하트", "summary": "사소함 속 좋은 징조의 날", "tip": "사소한 선택에도 좋은 징조가 숨어 있을 수 있어요. 호기심을 따라 한 걸음 더 가보세요.", "cup": "평소와 다른 커피 메뉴로 작은 행운의 변화를 만들어보세요."}, {"title": "돌아오는 마음 하트", "summary": "베푼 만큼 돌아오는 날", "tip": "오늘 쌓인 친절과 노력은 곧 돌아올 거예요. 스스로의 운을 믿어도 좋습니다.", "cup": "커피 한 잔과 함께 오늘 감사한 일을 하나 적어보세요."}, {"title": "편안한 행운 하트", "summary": "애쓰지 않아도 따라오는 날", "tip": "억지로 잡으려 하지 않아도 오늘은 좋은 흐름이 자연스럽게 따라올 거예요. 편하게 받아들여보세요.", "cup": "좋아하는 커피 한 잔으로 여유로운 아침을 시작해보세요."}, {"title": "작은 럭키 하트", "summary": "뜻밖의 기쁨이 스치는 날", "tip": "예상치 못한 순간에 작은 행운이 스칠 수 있어요. 오늘은 평소보다 조금 더 주변을 둘러보세요.", "cup": "새로 나온 시즌 음료를 한번 시도해보세요."}, {"title": "안정된 행운 하트", "summary": "꾸준함이 운을 부르는 날", "tip": "화려한 한 방보다 꾸준함이 오늘의 행운을 만듭니다. 하던 대로 이어가 보세요.", "cup": "매일 마시던 커피 한 잔이 오늘따라 더 맛있게 느껴질 거예요."}], "bouquet-2": [{"title": "풍성한 하트", "summary": "풍성한 마음이 돌아오는 날", "tip": "주변 사람의 장점을 하나씩 발견해보세요. 따뜻한 시선으로 바라본 하루는 생각보다 많은 좋은 관계를 선물해줄 거예요.", "cup": "간단한 간식이나 음료를 나눠보세요. 함께하는 한 잔이 평범한 시간을 특별한 장면으로 바꿔줍니다."}, {"title": "함께 나누는 기쁨 하트", "summary": "혼자보다 풍성해지는 날", "tip": "혼자만의 기쁨도 나누면 더 풍성해져요. 좋은 소식을 먼저 전해보세요.", "cup": "커피와 곁들일 작은 간식을 골라 누군가와 나눠보세요."}, {"title": "응원받는 하트", "summary": "주변의 힘을 느끼는 날", "tip": "주변에 이미 많은 응원이 있다는 것을 기억해보세요. 따뜻한 마음이 다시 돌아올 거예요.", "cup": "여유로운 시간에 좋아하는 커피를 들고 가까운 사람을 만나보세요."}, {"title": "다정이 넘치는 하트", "summary": "마음 씀씀이가 커지는 날", "tip": "오늘은 평소보다 조금 더 마음을 크게 써보세요. 그 다정함이 배로 돌아올 거예요.", "cup": "동료들과 커피를 나누며 짧은 담소를 즐겨보세요."}, {"title": "함께라서 좋은 하트", "summary": "곁에 있는 사람이 소중해지는 날", "tip": "당연하게 여겼던 사람의 소중함을 오늘 새삼 느끼게 될 거예요. 고마움을 표현해보세요.", "cup": "함께 커피를 마시며 그동안 못 했던 이야기를 나눠보세요."}, {"title": "풍요로운 마음 하트", "summary": "넉넉한 마음이 퍼지는 날", "tip": "오늘은 마음의 여유가 자연스럽게 주변으로 퍼져나갈 거예요. 편안하게 흘러가는 대로 두세요.", "cup": "좋아하는 디저트와 커피로 여유로운 티타임을 즐겨보세요."}], "bouquet-3": [{"title": "만개한 하트", "summary": "반가운 만남이 기다리는 날", "tip": "오늘은 스스로에게도 충분히 잘하고 있다고 말해보세요. 애써온 시간과 마음을 인정할수록 다음 기회가 더 선명하게 보일 거예요.", "cup": "하루를 마무리하며 가장 좋아하는 커피나 디저트를 골라보세요. 기분 좋은 마무리가 내일의 기대를 만듭니다."}, {"title": "활짝 핀 하트", "summary": "당신이 가장 빛나는 날", "tip": "오늘의 당신은 충분히 빛나요. 한껏 피어난 마음으로 사람들을 만나보세요.", "cup": "기분이 좋아지는 커피 한 잔으로 내일의 기대를 채워보세요."}, {"title": "기다리던 만남 하트", "summary": "반가운 소식이 가까이 온 날", "tip": "반가운 만남이나 소식이 가까이 와 있어요. 가벼운 약속에도 기분 좋게 응해보세요.", "cup": "새로운 카페 자리에서 좋아하는 커피를 즐겨보세요."}, {"title": "최고의 하루 하트", "summary": "모든 것이 잘 맞아떨어지는 날", "tip": "오늘은 유난히 계획한 일들이 순조롭게 풀릴 거예요. 자신 있게 밀고 나가보세요.", "cup": "특별한 날인 만큼 평소보다 근사한 커피 한 잔으로 자축해보세요."}, {"title": "풍만한 축복 하트", "summary": "주변의 축하가 이어지는 날", "tip": "오늘 이룬 작은 성취도 주변에 자랑해보세요. 함께 기뻐해 줄 사람들이 기다리고 있어요.", "cup": "좋아하는 사람들과 커피를 나누며 오늘을 함께 축하해보세요."}, {"title": "완전히 채워진 하트", "summary": "부족함 없이 충만한 날", "tip": "애쓰던 일들이 오늘은 완전히 제자리를 찾아갈 거예요. 그 충만함을 마음껏 누려보세요.", "cup": "가장 좋아하는 메뉴로 나에게 작은 축하를 건네보세요."}, {"title": "넘치는 행복 하트", "summary": "기쁨이 흘러넘치는 날", "tip": "오늘의 기쁨은 굳이 아끼지 않아도 괜찮아요. 표현할수록 더 커지는 하루가 될 거예요.", "cup": "달콤한 디저트와 진한 커피로 풍성한 하루를 마무리해보세요."}]};

  function artConfigFromInput(x, y, tailPull) {
    var positionIndex = x < -0.26 ? 0 : (x > 0.26 ? 2 : 1);
    var sizeIndex = y < -0.28 ? 0 : (y > 0.28 ? 2 : 1);
    var tailIndex = tailPull > 0.36 ? 2 : (tailPull > 0.12 ? 1 : 0);
    return {
      position: HEART_POSITIONS[positionIndex], size: HEART_SIZES[sizeIndex], tail: HEART_TAILS[tailIndex],
      positionIndex: positionIndex, sizeIndex: sizeIndex, tailIndex: tailIndex,
      key: HEART_POSITIONS[positionIndex].key + "-" + HEART_SIZES[sizeIndex].key + "-" + HEART_TAILS[tailIndex].key
    };
  }

  function artConfigFromSelection() {
    var positionIndex = state.selectedPositionIndex;
    var sizeIndex = state.selectedSizeIndex;
    var tailIndex = state.selectedTailIndex;
    return {
      position: HEART_POSITIONS[positionIndex], size: HEART_SIZES[sizeIndex], tail: HEART_TAILS[tailIndex],
      positionIndex: positionIndex, sizeIndex: sizeIndex, tailIndex: tailIndex,
      key: HEART_POSITIONS[positionIndex].key + "-" + HEART_SIZES[sizeIndex].key + "-" + HEART_TAILS[tailIndex].key
    };
  }

  function artAsset(art) {
    return "./images/latte-art-27/" + art.key + ".png?rev=latte-27-v3";
  }

  /* 기울기 · 번짐 · 겹수를 아트 래퍼에 적용한다. 기존 이미지 요소의 스타일은 건드리지 않는다. */
  function applyArtFlair(flairEl, ghost1El, ghost2El, art) {
    if (flairEl) {
      flairEl.style.setProperty("--art-tilt", (art.tiltDeg || 0).toFixed(1) + "deg");
      flairEl.style.setProperty("--art-blur", (art.bleed || 0).toFixed(2) + "px");
    }
    var asset = artAsset(art);
    var layerCount = art.layerCount || 1;
    if (ghost1El) {
      if (layerCount >= 2) { ghost1El.setAttribute("src", asset); ghost1El.classList.add("show1"); }
      else { ghost1El.classList.remove("show1"); ghost1El.removeAttribute("src"); }
    }
    if (ghost2El) {
      if (layerCount >= 3) { ghost2El.setAttribute("src", asset); ghost2El.classList.add("show2"); }
      else { ghost2El.classList.remove("show2"); ghost2El.removeAttribute("src"); }
    }
  }

  function resultByInput() {
    var art = artConfigFromSelection();
    art.score = (art.positionIndex + 1) * 100 + (art.sizeIndex + 1) * 10 + art.tailIndex;
    /* 기존 운세 문구 풀을 부드러운 크기 단계에 맞춰 재사용한다. */
    art.fortuneKey = ["single", "tulip", "bouquet"][art.sizeIndex] + "-" + art.positionIndex;
    /* 실제 흔든 궤적을 바탕으로 매번 다른 기울기 · 번짐 · 겹수를 더한다.
       state.tail은 마지막 한 프레임의 순간 변화량이라 값이 들쭉날쭉하므로,
       드래그가 끝난 시점의 최종 수직 위치(state.lastY, -1~1)를 기준으로 삼아 안정적으로 계산한다. */
    art.tiltDeg = Math.max(-30, Math.min(30, state.lastY * 26 + (art.positionIndex - 1) * 5));
    art.bleed = Math.max(0, Math.min(3, 0.3 + state.totalDistance * 0.15));
    art.layerCount = Math.max(1, Math.min(3, 1 + Math.floor(state.directionReversals / 2)));
    return art;
  }

  /* ------------------------- DOM ------------------------- */
  function $(id) { return document.getElementById(id); }
  function qs(sel) { return document.querySelector(sel); }

  var screens = {
    main: qs('[data-screen="main"]'),
    play: qs('[data-screen="play"]'),
    result: qs('[data-screen="result"]')
  };
  var el = {
    appRoot: $("app"),
    periodBadge: $("period-badge"),
    chanceChipMain: $("chance-chip-main"),
    startBtn: $("start-btn"),
    // play
    introOverlay: $("intro-overlay"),
    countdownNumber: $("countdown-number"),
    gaugeFill: $("gauge-fill"),
    timeRemaining: $("time-remaining"),
    pourInner: $("pour-inner"),
    cupPlay: $("cup-play"),
    cupRingLeft: $("cup-ring-left"),
    cupRingRight: $("cup-ring-right"),
    pourCallout: $("pour-callout"),
    pourTimeoutModal: $("pour-timeout-modal"),
    pourTimeoutConfirm: $("pour-timeout-confirm"),
    playLattePhoto: $("play-latte-photo"),
    playLattePhotoPrev: $("play-latte-photo-prev"),
    playArtFlair: $("play-art-flair"),
    playGhost1: $("play-latte-photo-ghost1"),
    playGhost2: $("play-latte-photo-ghost2"),
    pitcherPhoto: $("pitcher-photo"),
    holdHint: $("hold-hint"),
    pourBtn: $("pour-btn"),
    pourBtnLabel: $("pour-btn-label"),
    stageStatus: $("stage-status"),
    // result
    resultPhoto: $("result-photo"),
    resultArtFlair: $("result-art-flair"),
    resultGhost1: $("result-photo-ghost1"),
    resultGhost2: $("result-photo-ghost2"),
    resultHeartName: $("result-heart-name"),
    resultSummary: $("result-summary"),
    resultFortune: $("result-fortune"),
    couponBtn: $("coupon-btn"),
    couponBtnLabel: $("coupon-btn-label"),
    specialCouponBtn: $("special-coupon-btn"),
    specialCouponBtnLabel: $("special-coupon-btn-label"),
    bragBtn: $("brag-btn"),
    pointEntryStatus: $("point-entry-status"),
    chanceChipResult: $("chance-chip-result"),
    retryBtn: $("retry-btn"),
    homeBtn: $("home-btn"),
    toast: $("toast")
  };

  function showScreen(name) {
    if (el.appRoot) {
      el.appRoot.classList.remove("is-screen-dissolving");
      void el.appRoot.getBoundingClientRect();
      el.appRoot.classList.add("is-screen-dissolving");
      window.setTimeout(function () { if (el.appRoot) el.appRoot.classList.remove("is-screen-dissolving"); }, 320);
    }
    Object.keys(screens).forEach(function (k) {
      if (screens[k]) screens[k].classList.toggle("is-active", k === name);
    });
    if (screens[name]) screens[name].scrollTop = 0;
  }

  /* ------------------------- 토스트 (bridge 우선, 미지원 시 DOM) --- */
  function toast(msg) {
    if (state.bridge && state.bridge.ui && typeof state.bridge.ui.toast === "function") {
      try { state.bridge.ui.toast({ message: msg }); return; } catch (e) { /* fallthrough */ }
    }
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.classList.add("show");
    window.clearTimeout(el.toast._t);
    el.toast._t = window.setTimeout(function () { el.toast.classList.remove("show"); }, 2200);
  }

  /* ------------------------- Bridge bootstrap ------------------------- */
  function getBridge() { return window.OGOGBridge || null; }

  function waitForBridgeReady(timeoutMs) {
    return new Promise(function (resolve, reject) {
      var existing = getBridge();
      var timeoutId = null;
      if (existing) { resolve(existing); return; }

      function cleanup() {
        if (timeoutId) window.clearTimeout(timeoutId);
        window.removeEventListener("ogogbridge:ready", onReady);
      }
      function onReady() {
        var b = getBridge();
        if (!b) return;
        cleanup(); resolve(b);
      }
      window.addEventListener("ogogbridge:ready", onReady);
      timeoutId = window.setTimeout(function () {
        cleanup(); reject(new Error("OGOGBridge ready timeout"));
      }, timeoutMs || 8000);
    });
  }

  function dataOf(res) { return res && res.data ? res.data : null; }

  function applyParticipation(res) {
    var d = dataOf(res);
    var remaining = d && typeof d.remainingCount === "number" ? d.remainingCount : null;
    var playable = d && typeof d.playable === "boolean" ? d.playable : null;
    state.participation = { remainingCount: remaining, playable: playable };
    state.specialCouponSharedToday = !!(d && d.benefitEligibility && d.benefitEligibility.specialCoupon && d.benefitEligibility.specialCoupon.sharedToday);
  }

  function applyParticipationFromComplete(res) {
    var d = dataOf(res);
    if (!d || typeof d.remainingCount !== "number") return false;
    state.participation = {
      remainingCount: d.remainingCount,
      playable: typeof d.playable === "boolean" ? d.playable : state.participation.playable
    };
    if (d.benefitEligibility && d.benefitEligibility.specialCoupon && typeof d.benefitEligibility.specialCoupon.sharedToday === "boolean") {
      state.specialCouponSharedToday = d.benefitEligibility.specialCoupon.sharedToday;
    }
    return true;
  }

  function refreshParticipation() {
    if (!state.bridge) { renderChances(); return Promise.resolve(null); }
    return state.bridge.participation.getState().then(function (res) {
      if (!res || !res.ok) throw new Error("PARTICIPATION_UNAVAILABLE");
      applyParticipation(res);
      renderChances();
      renderCouponState();
      return res;
    });
  }

  /* ------------------------- 참여 기회 렌더 ------------------------- */
  function hasChance() {
    return typeof state.participation.remainingCount === "number" && state.participation.remainingCount > 0 && state.participation.playable !== false;
  }

  function isOutOfChance() {
    return state.participation.remainingCount === 0;
  }

  function renderChances() {
    if (el.chanceChipMain) {
      el.chanceChipMain.hidden = !hasChance();
      el.chanceChipMain.innerHTML = "오늘 참여 기회 <b>" + (hasChance() ? state.participation.remainingCount : 0) + "회</b> 남았어요";
    }
    if (el.startBtn) {
      el.startBtn.disabled = state.extraChanceAdBusy || (state.participation.remainingCount === null) || (!hasChance() && !isOutOfChance());
      el.startBtn.textContent = hasChance() ? "라떼 만들기" : (isOutOfChance() ? "광고 보고 1번 더 만들기" : "참여 기회 확인 중");
    }
    if (el.chanceChipResult) {
      el.chanceChipResult.hidden = !hasChance();
      el.chanceChipResult.innerHTML = "오늘 참여 기회 <b>" + (hasChance() ? state.participation.remainingCount : 0) + "회</b> 남았어요";
    }
    if (el.retryBtn) {
      el.retryBtn.disabled = state.extraChanceAdBusy || (state.participation.remainingCount === null) || (!hasChance() && !isOutOfChance());
      el.retryBtn.textContent = hasChance() ? "한 번 더 만들기" : (isOutOfChance() ? "광고 보고 1번 더 만들기" : "참여 기회 확인 중");
    }
  }

  /* ------------------------- 초기화 ------------------------- */
  function init() {
    if (el.periodBadge) el.periodBadge.textContent = EVENT_PERIOD;
    bindEvents();
    if (isPreviewMode()) {
      state.participation = { remainingCount: 3, playable: true };
      renderChances();
      return;
    }
    renderChances();

    waitForBridgeReady(8000).then(function (bridge) {
      state.bridge = bridge;
      return refreshParticipation();
    }).catch(function (err) {
      console.warn("[heart-latte] bridge unavailable:", err && err.message);
      toast("게임 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    });
  }

  /* ------------------------- 이벤트 바인딩 ------------------------- */
  function bindEvents() {
    if (el.startBtn) el.startBtn.addEventListener("click", onStart);
    if (el.cupPlay) {
      el.cupPlay.addEventListener("pointerdown", onCupDown);
      el.cupPlay.addEventListener("pointermove", onCupMove);
      el.cupPlay.addEventListener("pointerup", onCupUp);
      el.cupPlay.addEventListener("pointercancel", onCupUp);
      el.cupPlay.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    }

    if (el.couponBtn) el.couponBtn.addEventListener("click", onCoupon);
    if (el.specialCouponBtn) el.specialCouponBtn.addEventListener("click", onSpecialCoupon);
    if (el.bragBtn) el.bragBtn.addEventListener("click", onBrag);
    if (el.retryBtn) el.retryBtn.addEventListener("click", onRetry);
    if (el.homeBtn) el.homeBtn.addEventListener("click", onHome);
  }

  /* ------------------------- 시작 → 플레이 ------------------------- */
  function onStart() {
    refreshParticipation().then(function () {
      startGameOrWatchAd();
    }).catch(function () {});
  }

  function startGameOrWatchAd() {
    if (hasChance()) {
      goToPlay();
      return;
    }
    if (isOutOfChance()) requestExtraChanceAndPlay();
  }

  function requestExtraChanceAndPlay() {
    if (state.extraChanceAdBusy || !isOutOfChance()) return;
    if (!state.bridge || !state.bridge.ad || !state.bridge.participation || typeof state.bridge.participation.getExtraChance !== "function") {
      toast("광고 추가 기회는 OK캐쉬백 앱 또는 모바일 브라우저에서 이용할 수 있어요.");
      return;
    }
    state.extraChanceAdBusy = true;
    renderChances();
    state.bridge.ad.getStatus({ placementId: EXTRA_CHANCE_AD_PLACEMENT_ID }).then(function (statusRes) {
      var statusData = dataOf(statusRes);
      if (!statusRes || !statusRes.ok || (statusData && statusData.available === false)) throw new Error("AD_UNAVAILABLE");
      return state.bridge.ad.show({ placementId: EXTRA_CHANCE_AD_PLACEMENT_ID });
    }).then(function (showRes) {
      var showData = dataOf(showRes);
      var status = showData && showData.status;
      if (!showRes || !showRes.ok || (status !== "SHOWN" && status !== "COMPLETED") || !showData.transactionId) throw new Error("AD_NOT_COMPLETED");
      return state.bridge.ad.complete({
        flowId: EXTRA_CHANCE_AD_FLOW_ID,
        placementId: EXTRA_CHANCE_AD_PLACEMENT_ID,
        transactionId: showData.transactionId,
        adNetwork: showData.adNetwork
      });
    }).then(function (completeRes) {
      var completeData = dataOf(completeRes);
      if (!completeRes || !completeRes.ok || !completeData || completeData.grantedCount <= 0) throw new Error("EXTRA_CHANCE_NOT_GRANTED");
      return state.bridge.participation.getExtraChance();
    }).then(function () {
      return refreshParticipation();
    }).then(function () {
      state.extraChanceAdBusy = false;
      renderChances();
      if (hasChance()) goToPlay();
    }).catch(function () {
      state.extraChanceAdBusy = false;
      renderChances();
      toast("광고를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.");
    });
  }

  function resetPlayVisual() {
    state.pouring = false; state.canPour = false; state.poured = false; state.level = 0;
    state.layerCount = 0; state.totalHeldMs = 0; state.continuousSizeStep = 0; state.gameStartTs = 0;
    state.dragging = false; state.pointerId = null; state.x = 0; state.y = 0; state.targetX = 0; state.targetY = 0;
    state.lastX = 0; state.lastY = 0; state.lastMoveTs = 0; state.totalDistance = 0; state.totalRotation = 0;
    state.lastAngle = null; state.tail = 0; state.tailPull = 0; state.moved = false;
    state.directionReversals = 0; state.lastDirSign = 0;
    state.selectedPositionIndex = 1; state.selectedSizeIndex = 1; state.selectedTailIndex = 0;
    state.lockedCupX = 0; state.lockedCupY = 0; state.controlPhase = -1;
    state.playPhase = -1; state.playAsset = "";
    state.lastArtSwapTs = 0;
    if (state.rafId) { window.cancelAnimationFrame(state.rafId); state.rafId = 0; }
    if (el.gaugeFill) el.gaugeFill.style.width = "100%";
    if (el.timeRemaining) el.timeRemaining.textContent = String(Math.ceil(PLAY_MS / 1000));
    if (el.cupPlay) {
      el.cupPlay.style.removeProperty("--cup-x");
      el.cupPlay.style.removeProperty("--cup-y");
      el.cupPlay.style.removeProperty("--cup-rx");
      el.cupPlay.style.removeProperty("--cup-ry");
      el.cupPlay.style.removeProperty("--cup-rz");
    }
    if (el.pitcherPhoto) {
      el.pitcherPhoto.style.removeProperty("--pitcher-x");
      el.pitcherPhoto.style.removeProperty("--pitcher-rot");
    }
    if (el.cupRingLeft) el.cupRingLeft.classList.remove("active");
    if (el.cupRingRight) el.cupRingRight.classList.remove("active");
    if (el.playArtFlair) {
      el.playArtFlair.style.removeProperty("--art-tilt");
      el.playArtFlair.style.removeProperty("--art-blur");
    }
    if (el.playGhost1) { el.playGhost1.classList.remove("show1"); el.playGhost1.removeAttribute("src"); }
    if (el.playGhost2) { el.playGhost2.classList.remove("show2"); el.playGhost2.removeAttribute("src"); }
    if (el.cupPlay) el.cupPlay.classList.remove("has-moved");
    if (el.playLattePhoto) el.playLattePhoto.setAttribute("src", "./images/latte-play-30deg-alpha-v1.png");
    if (el.playLattePhotoPrev) el.playLattePhotoPrev.setAttribute("src", "./images/latte-play-30deg-alpha-v1.png");
    if (el.pourInner) el.pourInner.classList.remove("is-pouring", "is-ready", "is-settling");
    if (el.holdHint) { el.holdHint.style.opacity = "1"; el.holdHint.textContent = "나만의 하트가 완성돼요"; }
    if (el.stageStatus) el.stageStatus.textContent = "컵을 좌우로 흔들어보세요";
    if (el.pourTimeoutModal) el.pourTimeoutModal.classList.remove("show");
  }

  function goToPlay() {
    resetPlayVisual();
    showScreen("play");
    runIntro();
  }

  function runIntro() {
    if (!el.introOverlay) { armPour(); return; }
    el.introOverlay.style.display = "flex";
    var count = 3;
    function showCount() {
      if (el.countdownNumber) {
        el.countdownNumber.textContent = String(count);
        el.countdownNumber.classList.remove("pop");
        void el.countdownNumber.getBoundingClientRect();
        el.countdownNumber.classList.add("pop");
      }
      if (count === 0) {
        el.introOverlay.style.display = "none";
        armPour();
        return;
      }
      count -= 1;
      window.setTimeout(showCount, 1000);
    }
    showCount();
  }

  function armPour() {
    reportStart().then(function () {
      state.canPour = true;
      state.poured = false;
      if (el.pourInner) el.pourInner.classList.add("is-ready");
    }).catch(function () {
      showScreen("main");
      toast("게임을 시작하지 못했어요. 다시 시도해 주세요.");
    });
  }

  function beginPour(now) {
    if (state.gameStartTs || state.poured) return;
    state.pouring = true;
    state.gameStartTs = now || performance.now();
    if (el.pourInner) { el.pourInner.classList.remove("is-ready"); el.pourInner.classList.add("is-pouring"); }
    if (el.holdHint) el.holdHint.textContent = "나만의 하트가 완성돼요";
    state.rafId = window.requestAnimationFrame(gameTick);
  }

  function reportStart() {
    // 로컬 파일 검수 시에만 Bridge 없이 인터랙션을 미리 볼 수 있다.
    if (isPreviewMode()) return Promise.resolve({ ok: true });
    if (!state.bridge) return Promise.reject(new Error("BRIDGE_UNAVAILABLE"));
    try {
      var p = state.bridge.execution.report({ type: "START", body: { entryPath: "play" } });
      return Promise.resolve(p).then(function (res) {
        if (!res || !res.ok) throw new Error("START_REJECTED");
        return res;
      });
    } catch (e) { return Promise.reject(e); }
  }

  /* ------------------------- 컵 컨트롤 (5초) ------------------------- */
  function onCupDown(e) {
    if (!state.canPour || state.poured) return;
    e.preventDefault();
    state.dragging = true;
    state.pointerId = e.pointerId;
    try { el.cupPlay.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    updateCupFromPointer(e, true);
    if (el.cupPlay) el.cupPlay.classList.add("is-dragging");
  }

  function onCupMove(e) {
    if (!state.dragging || e.pointerId !== state.pointerId) return;
    e.preventDefault();
    updateCupFromPointer(e, false);
  }

  function onCupUp(e) {
    if (!state.dragging || (e && e.pointerId !== state.pointerId)) return;
    state.dragging = false;
    state.pointerId = null;
    if (el.cupPlay) el.cupPlay.classList.remove("is-dragging");
  }

  function updateCupFromPointer(e, isStart) {
    if (!el.pourInner) return;
    var rect = el.pourInner.getBoundingClientRect();
    var nx = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width - 0.5) * 2));
    var ny = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height - 0.5) * 2));
    var now = performance.now();
    if (!isStart) {
      var dx = nx - state.lastX, dy = ny - state.lastY;
      var distance = Math.sqrt(dx * dx + dy * dy);
      state.totalDistance += distance;
      state.tail = Math.max(-1, Math.min(1, dy * 8));
      /* 좌우로 흔든 방향이 바뀐 횟수를 세어, 하트가 몇 겹으로 겹쳐 보일지 결정한다. */
      if (Math.abs(dx) > 0.03) {
        var dirSign = dx > 0 ? 1 : -1;
        if (state.lastDirSign !== 0 && dirSign !== state.lastDirSign) {
          state.directionReversals += 1;
        }
        state.lastDirSign = dirSign;
      }
      var angle = Math.atan2(ny, nx);
      if (state.lastAngle !== null) {
        var delta = angle - state.lastAngle;
        if (delta > Math.PI) delta -= Math.PI * 2;
        if (delta < -Math.PI) delta += Math.PI * 2;
        state.totalRotation += delta;
      }
      state.lastAngle = angle;
      state.moved = state.moved || distance > 0.025;
      if (!state.gameStartTs && distance > 0.018) {
        if (el.cupPlay) el.cupPlay.classList.add("has-moved");
        beginPour(now);
      }
      if (state.gameStartTs) updateArtSelection(nx, ny);
    } else {
      state.lastAngle = Math.atan2(ny, nx);
    }
    /* 모든 축을 끝까지 열어 둔다: 좌우=위치, 회전=크기, 상하=꼬리. */
    state.targetX = nx;
    state.targetY = ny;
    state.lastX = nx; state.lastY = ny; state.lastMoveTs = now;
  }

  function updateArtSelection(nx, ny) {
    state.selectedPositionIndex = nx < -0.26 ? 0 : (nx > 0.26 ? 2 : 1);
    /* 반시계=스몰, 중립=중간, 시계=빅. 누적 각도에 완만한 문턱을 둔다. */
    state.selectedSizeIndex = state.totalRotation < -0.86 ? 0 : (state.totalRotation > 0.86 ? 2 : 1);
    /* 위=짧은 꼬리, 중앙=중간, 아래=긴 꼬리. */
    state.selectedTailIndex = ny < -0.26 ? 0 : (ny > 0.26 ? 2 : 1);
  }

  function gameTick(now) {
    if (!state.canPour || !state.gameStartTs) return;
    state.level = Math.min(100, ((now - state.gameStartTs) / PLAY_MS) * 100);
    if (el.timeRemaining) el.timeRemaining.textContent = String(Math.max(0, Math.ceil((PLAY_MS - (now - state.gameStartTs)) / 1000)));
    updateControlVisual(now);
    if (state.level >= 100) {
      finishPour();
      return;
    }
    state.rafId = window.requestAnimationFrame(gameTick);
  }

  function updateControlVisual(now) {
    if (el.gaugeFill) el.gaugeFill.style.width = (100 - state.level) + "%";
    state.x += (state.targetX - state.x) * 0.16;
    state.y += (state.targetY - state.y) * 0.16;
    if (el.stageStatus) el.stageStatus.textContent = "컵을 좌우로 흔들어보세요";
    if (el.holdHint) el.holdHint.textContent = "나만의 하트가 완성돼요";
    var layers = Math.max(1, Math.min(4, Math.floor(Math.abs(state.totalRotation) / (Math.PI * 0.85)) + 1));
    var cupTilt = Math.max(-16, Math.min(16, state.totalRotation * 4.5));
    if (el.cupPlay) {
      el.cupPlay.style.setProperty("--cup-x", (state.x * 22).toFixed(1) + "px");
      el.cupPlay.style.setProperty("--cup-y", (state.y * 16).toFixed(1) + "px");
      el.cupPlay.style.setProperty("--cup-rx", "0deg");
      el.cupPlay.style.setProperty("--cup-ry", "0deg");
      el.cupPlay.style.setProperty("--cup-rz", cupTilt.toFixed(1) + "deg");
    }
    if (el.pitcherPhoto) {
      /* 컵이 흔들리는 동안 포트도 같은 방향으로 뚜렷하게 흔들려야 멈춰 있어 보이지 않는다.
         부드럽게 보정된 state.x 대신, 지연 없는 실제 포인터 위치(targetX)를 그대로 사용해 반응을 키운다. */
      el.pitcherPhoto.style.setProperty("--pitcher-x", (state.targetX * 34).toFixed(1) + "px");
      el.pitcherPhoto.style.setProperty("--pitcher-rot", (state.targetX * 20).toFixed(1) + "deg");
    }
    if (el.cupRingRight && el.cupRingLeft) {
      /* 누적 진행률이 아니라, 지금 흔드는 실제 방향(state.lastDirSign)에 맞는 쪽에만 얇은 호를 켠다. */
      if (state.lastDirSign > 0) {
        el.cupRingRight.classList.add("active");
        el.cupRingLeft.classList.remove("active");
      } else if (state.lastDirSign < 0) {
        el.cupRingLeft.classList.add("active");
        el.cupRingRight.classList.remove("active");
      }
    }
    state.layerCount = layers;
    var liveArt = artConfigFromSelection();
    setPlayArtImage(liveArt, 1, now);
  }

  function setPlayArtImage(art, phase, now) {
    if (!el.playLattePhoto) return;
    var asset = phase === 0 ? "./images/latte-play-30deg-alpha-v1.png" : artAsset(art);
    if (state.playAsset === asset) return;
    /* 경계에서 손가락이 미세하게 흔들려도 이미지가 연속 점멸하지 않도록 한 박자 유지한다. */
    if (state.playAsset && now - state.lastArtSwapTs < 360) return;
    var previousAsset = state.playAsset || el.playLattePhoto.getAttribute("src");
    state.playAsset = asset;
    state.lastArtSwapTs = now;
    if (el.playLattePhotoPrev && previousAsset && previousAsset !== asset) {
      el.playLattePhotoPrev.setAttribute("src", previousAsset);
      el.playLattePhotoPrev.classList.remove("crossfade-out");
      void el.playLattePhotoPrev.getBoundingClientRect();
      el.playLattePhotoPrev.classList.add("crossfade-out");
    }
    el.playLattePhoto.classList.remove("phase-in");
    el.playLattePhoto.setAttribute("src", asset);
    void el.playLattePhoto.getBoundingClientRect();
    el.playLattePhoto.classList.add("phase-in");
  }

  function finishPour() {
    if (state.poured) return;
    state.pouring = false;
    state.poured = true;
    state.canPour = false;
    if (el.pourInner) { el.pourInner.classList.remove("is-pouring"); el.pourInner.classList.add("is-settling"); }
    if (state.rafId) { window.cancelAnimationFrame(state.rafId); state.rafId = 0; }
    if (el.holdHint) el.holdHint.textContent = "하트가 피어났어요. 오늘의 운세를 확인해보세요.";
    var result = resultByInput();
    /* 종료 직전 화면과 결과가 같은 확정 키를 공유한다. */
    state.playAsset = artAsset(result);
    if (el.playLattePhoto) el.playLattePhoto.setAttribute("src", state.playAsset);
    applyArtFlair(el.playArtFlair, el.playGhost1, el.playGhost2, result);
    window.setTimeout(function () { completePlay(result); }, 1200);
  }

  /* ------------------------- COMPLETE → 결과 ------------------------- */
  function completePlay(tier) {
    if (!state.bridge) {
      if (isPreviewMode()) {
        renderResult(tier);
        showScreen("result");
        return;
      }
      showScreen("main");
      toast("게임 정보를 확인하지 못했어요. 다시 시도해 주세요.");
      return;
    }

    state.bridge.execution.report({
      type: "COMPLETE",
      score: tier.score,
      body: { score: tier.score, resultType: tier.key, entryPath: "result" }
    }).then(function (res) {
      if (!res || !res.ok) throw new Error("COMPLETE_REJECTED");
      // 남은 기회는 COMPLETE 응답 우선, 없으면 getState 재조회
      if (!applyParticipationFromComplete(res)) {
        refreshParticipation();
      } else {
        renderChances();
      }
      renderResult(tier);
      showScreen("result");
    }).catch(function (err) {
      console.warn("[heart-latte] COMPLETE failed:", err && err.message);
      // 완료 처리 실패 시 오류 리포트
      try {
        state.bridge.execution.report({ type: "ERROR", body: { stage: "complete", message: "complete_failed" } });
      } catch (e2) { /* noop */ }
      refreshParticipation();
      showScreen("main");
      toast("결과를 저장하지 못했어요. 다시 한 번 시도해 주세요.");
    });
  }

  function renderResult(tier) {
    var pool = FORTUNE_SETS[tier.fortuneKey] || FORTUNE_SETS["single-0"];
    var entry = pool[Math.floor(Math.random() * pool.length)];
    if (el.resultPhoto) el.resultPhoto.setAttribute("src", artAsset(tier));
    applyArtFlair(el.resultArtFlair, el.resultGhost1, el.resultGhost2, tier);
    if (el.resultHeartName) el.resultHeartName.textContent = entry.title;
    if (el.resultSummary) el.resultSummary.textContent = entry.summary;
    if (el.resultFortune) el.resultFortune.innerHTML = "<p><b>이렇게 해보세요</b><span>" + entry.tip + "</span></p><p><b>오늘의 한 잔</b><span>" + entry.cup + "</span></p>";
    if (el.pointEntryStatus) el.pointEntryStatus.textContent = "1,000P 응모 완료";
    renderCouponState();
  }

  /* ------------------------- 쿠폰 받기 ------------------------- */
  function onCoupon() {
    toast("쿠폰 상세를 준비 중이에요.");
  }

  function onSpecialCoupon() {
    if (state.specialCouponSharedToday) {
      onCoupon();
      return;
    }
    requestSpecialCouponShare();
  }

  function renderCouponState() {
    if (!el.couponBtn || !el.specialCouponBtn) return;
    if (el.couponBtnLabel) { el.couponBtnLabel.textContent = "쿠폰 받기"; } else { el.couponBtn.textContent = "쿠폰 받기"; }
    el.specialCouponBtn.disabled = state.specialCouponShareBusy;
    var specialLabel = state.specialCouponSharedToday ? "쿠폰 받기" : (state.specialCouponShareBusy ? "공유 확인 중…" : "공유하고 쿠폰 받기");
    if (el.specialCouponBtnLabel) { el.specialCouponBtnLabel.textContent = specialLabel; } else { el.specialCouponBtn.textContent = specialLabel; }
  }

  function requestSpecialCouponShare() {
    if (state.specialCouponShareBusy || state.specialCouponSharedToday) return;
    if (!state.bridge || !state.bridge.share || typeof state.bridge.share.requestKakao !== "function" || typeof state.bridge.share.complete !== "function") {
      toast("카카오톡 공유를 완료하지 못했어요. 다시 시도해 주세요.");
      return;
    }
    state.specialCouponShareBusy = true;
    renderCouponState();
    state.bridge.share.requestKakao({
      flowId: SPECIAL_COUPON_SHARE_FLOW_ID,
      shareChannel: "KAKAO",
      shareOptions: { title: "오늘의 라떼 운세", description: "내 라떼에 피어난 오늘의 운세를 확인해보세요." }
    }).then(function (res) {
      var data = dataOf(res);
      if (!res || !res.ok || !data || data.status !== "COMPLETED") throw new Error("SHARE_NOT_COMPLETED");
      return state.bridge.share.complete({});
    }).then(function (completeRes) {
      if (!completeRes || !completeRes.ok) throw new Error("SHARE_COMPLETE_FAILED");
      return refreshParticipation();
    }).then(function () {
      state.specialCouponShareBusy = false;
      renderCouponState();
      if (!state.specialCouponSharedToday) toast("공유 보상을 확인 중이에요. 잠시 후 다시 확인해 주세요.");
    }).catch(function () {
      state.specialCouponShareBusy = false;
      renderCouponState();
      toast("카카오톡 공유를 완료하지 못했어요. 다시 시도해 주세요.");
    });
  }

  /* ------------------------- 친구에게 운세 공유하기 -------------------- */
  function onBrag() {
    requestSpecialCouponShare();
  }

  /* ------------------------- 다시하기 / 처음으로 ------------------------- */
  function onRetry() {
    refreshParticipation().then(function () {
      startGameOrWatchAd();
    }).catch(function () {});
  }

  function onHome() {
    refreshParticipation().catch(function () {});
    showScreen("main");
  }

  /* ------------------------- 시작 ------------------------- */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
