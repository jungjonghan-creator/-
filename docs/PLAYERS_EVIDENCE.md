# 선수 근거 문서 (PLAYERS_EVIDENCE)

> POKER ARENA 5.0 — World Poker Universe 2035 | 90 featured AI players (2026-10-29)
> 실존 선수 24명의 일부 공개 이력은 evidence_sources로 참고. 게임 아키타입과 0~100 실력 수치는 전적으로 시뮬레이션용 설정이며 검증 통계 아님. 선수의 공식 제휴·참여를 암시하지 않는다. 외부 공개 전 권리 검토.
> 2035년 창작 선수 66명은 허구. 동명이인과 무관하며 국가·도시·전적·성향·수치는 모두 창작 설정.

- 이 문서의 표는 `scripts/genDocs.ts`가 `POKER_ARENA_5_2035_Player_Seed_v2_90.json`에서 생성한다. 선수 조사는 GPT 데이터팩으로 종료했고 재조사하지 않았다.
- `evidence_level`: confirmed_result(공개 대회 결과) / public_interview / reported_style / design_hypothesis(창작).
- **0~100 실력 수치(preflop/postflop/ICM/HU/exploit/risk/adaptation/consistency)는 게임 밸런스용 시뮬레이션 파라미터**이며 실존 인물의 실제 능력·평가·검증 통계가 아니다. `stats_are_verified=false`, `official_appearance_rights_confirmed=false`.
- 실존 선수는 **2026 전성기 타임캡슐** 버전으로 출전하는 허구 설정이며 선수 본인의 허락·후원·참여를 의미하지 않는다. 사진·로고·영상·기사 원문을 사용하지 않고 이니셜만 표시한다. ID가 분리되어 있어 권리 문제 시 가명 데이터팩으로 교체할 수 있다.

## 실존 레전드 AI (24명)
| ID | 이름 | 국적 | 근거 수준 | AI 프로필 | 강점(가설) | 공개 근거 URL |
| --- | --- | --- | --- | --- | --- | --- |
| `legend_elky` | Bertrand "ElkY" Grospellier | 프랑스 | reported_style | AdaptivePro | 토너먼트 적응·복수 포맷 경험 | https://www.pokernews.com/poker-players/bertrand-grospellier/<br>https://www.worldpokertour.com/player/elky-grospellier/ |
| `legend_durrrr` | Tom "durrrr" Dwan | 미국 | reported_style | LAG | 딥스택에서 다양한 베팅 크기와 공격 | https://www.poker.org/poker-players/tom-dwan/<br>https://www.pokernews.com/news/2019/04/throwback-thursday-the-beginning-of-the-durrrr-challenge-33940.htm |
| `legend_jinho` | 홍진호 | 대한민국 | reported_style | Nit | 상황별 공격과 토너먼트 생존 감각 | https://www.cardplayer.com/poker-players/367112-jinho-hong<br>https://www.dailygame.co.kr/view.php?ud=202307101848219294da2c546b3a_26 |
| `legend_gabyong` | 김갑용 (Gab Yong Kim) | 대한민국 | reported_style | AdaptivePro | 국제 대회 포맷 적응·대회 집중 | https://kphf.co.kr/<br>https://v.daum.net/v/6VfYDFMVtf<br>https://koreawpt.com/poker-players/global-poker-index-rankings/202312/kim-gap-yong/ |
| `legend_sunnyjung` | Hyung Sun "Sunny" Jung (정형선) | 대한민국 | reported_style | AdaptivePro | 아시아 대회에서 안정적 멀티데이 적응 | https://www.cardplayer.com/poker-players/169223-sunny-jung/results/overall<br>https://www.globalpokerindex.com/poker-players/sunny-jung-157085/ |
| `legend_7high` | Seungmook Jung / 7high (정승묵) | 대한민국 | reported_style | Balanced | 하이롤러와 아시아 국제대회 경험 | https://pokerdb.thehendonmob.com/player.php?a=r&n=629492<br>https://www.globalpokerindex.com/poker-players/seungmook-jung-977569/ |
| `legend_ivey` | Phil Ivey | 미국 | reported_style | AdaptivePro | 상대 패턴 읽기·멀티스트리트 적응 | https://www.wsop.com/players/244135544/phil-ivey/ |
| `legend_negreanu` | Daniel Negreanu | 캐나다 | reported_style | AdaptivePro | 상대별 익스플로잇과 균형 전략 | https://www.wsop.com/news/daniel-negreanu-takes-new-strategy-into-100k-high-roller/ |
| `legend_hellmuth` | Phil Hellmuth | 미국 | reported_style | Rock | 토너먼트 위험 회피와 경험적 적응 | https://www.wsop.com/players/690290266/phil-hellmuth/?awardType=Bracelet |
| `legend_jungleman` | Dan "Jungleman" Cates | 미국 | reported_style | LAG | 헤즈업 압박과 취약점 공격 | https://paulphuapoker.com/dan-jungleman-cates/<br>https://www.cardplayer.com/cardplayer-poker-magazines/65799-poker-hall-of-fame-23-20/articles/19757-capture-the-flag-daniel-jungleman12-cates |
| `legend_koon` | Jason Koon | 미국 | reported_style | TAG | 고액 대회에서 정교한 범위 운영 | https://tritonpokerseries.com/en-US/news/headlines/jason-koon-a-perfect-fit-for-the-poker-hall-of-fame<br>https://www.pokernews.com/news/2026/08/year-by-year-jason-koon-hall-of-fame-career-52053.htm |
| `legend_mateos` | Adrián Mateos | 스페인 | reported_style | LAG | 포지션과 레인지 우위를 이용한 압박 | https://www.spadepoker.com/en/players/adrian-mateos/ |
| `legend_patrik_antonius` | Patrik Antonius | 핀란드 | reported_style | TAG | 딥스택 멀티스트리트 팟 컨트롤 | https://www.pokernews.com/poker-players/patrik-antonius/ |
| `legend_stephen_chidwick` | Stephen Chidwick | 영국 | reported_style | Nit | 하이롤러 MTT의 ICM 판단 | https://www.wsop.com/players/333717564/stephen-chidwick/ |
| `legend_kristen_foxen` | Kristen Foxen | 미국 | reported_style | TAG | 토너먼트 포지션 압박 | https://www.wsop.com/players/651425636/kristen-foxen/ |
| `legend_addamo` | Michael Addamo | 호주 | reported_style | TAG | 넓은 베팅 사이징과 압박 | https://www.pokernews.com/poker-players/michael-addamo/ |
| `legend_david_peters` | David Peters | 미국 | reported_style | Balanced | 고위험 토너먼트의 위험 관리 | https://www.pokernews.com/poker-players/david-peters/ |
| `legend_isaac_haxton` | Isaac Haxton | 미국 | reported_style | AdaptivePro | 레인지 구성과 딥스택 익스플로잇 | https://www.pokernews.com/poker-players/isaac-haxton/ |
| `legend_maria_ho` | Maria Ho | 미국 | reported_style | TAG | 상대 유형 분류·탄탄한 밸류 라인 | https://www.pokernews.com/poker-players/maria-ho/ |
| `legend_moneymaker` | Chris Moneymaker | 미국 | reported_style | AdaptivePro | 메인 이벤트 적응력과 미드스택 생존 | https://www.pokernews.com/poker-players/chris-moneymaker/ |
| `legend_xuan_liu` | Xuan Liu | 캐나다 | reported_style | Balanced | 글로벌 MTT 변동성 관리 | https://www.pokernews.com/poker-players/xuan-liu/ |
| `legend_vanessa_selbst` | Vanessa Selbst | 미국 | reported_style | LAG | 활발한 포스트플랍 공격 설계 | https://www.pokernews.com/poker-players/vanessa-selbst/ |
| `legend_erik_seidel` | Erik Seidel | 미국 | reported_style | TAG | 오랜 라이브 대회 경험 기반 인내 | https://www.wsop.com/players/782178483/erik-seidel/ |
| `legend_jennifer_harman` | Jennifer Harman | 미국 | reported_style | Trapper | 멀티웨이 캐시게임 밸류 추출 | https://www.pokernews.com/poker-players/jennifer-harman/ |

## 2035 가상 신예 (66명, 전부 창작)
| ID | 이름 | 국적 | 거점 | 주 무대 | 강점 | 약점/대응 |
| --- | --- | --- | --- | --- | --- | --- |
| `future_seo_harim` | 서하림 | 대한민국 | 부산 | 작은 팟을 꾸준히 모으는 실전형 | 작은 팟을 꾸준히 모으는 실전형 | 오버벳 블러프에 대한 대응 |
| `future_kim_seoyun` | 김서윤 | 대한민국 | 서울 | 버블에서 위험 프리미엄 계산 | 버블에서 위험 프리미엄 계산 | 초기 딥스택 공격 |
| `future_park_taesan` | 박태산 | 대한민국 | 대구 | 포스트플랍 얇은 밸류 | 포스트플랍 얇은 밸류 | 프리플랍 숏스택 |
| `future_lee_hajun` | 이하준 | 대한민국 | 인천 | 효율적인 3벳 레인지 | 효율적인 3벳 레인지 | 리버 블러프 캐치 |
| `future_choi_mina` | 최미나 | 대한민국 | 제주 | 티켓 버블 생존 최적화 | 티켓 버블 생존 최적화 | 일반 캐시 변동성 |
| `future_yoon_dohyeon` | 윤도현 | 대한민국 | 광주 | 버튼 오픈과 스몰 팟 탈취 | 버튼 오픈과 스몰 팟 탈취 | 멀티웨이 딥스택 |
| `future_jeong_arin` | 정아린 | 대한민국 | 대전 | 바운티 가치 판단 | 바운티 가치 판단 | 바운티 없는 FT |
| `future_song_eunwoo` | 송은우 | 대한민국 | 울산 | 강한 패의 밸류 추출 | 강한 패의 밸류 추출 | 장기 블러프 균형 |
| `future_han_jiho` | 한지호 | 대한민국 | 부산 | 큰 필드에서 분산 관리 | 큰 필드에서 분산 관리 | 상대 플레이가 정교한 3벳팟 |
| `future_kang_yerin` | 강예린 | 대한민국 | 서울 | 상대 이미지 변화 분석 | 상대 이미지 변화 분석 | 빠른 하이퍼터보 |
| `future_lin_yuchen` | Lin Yuchen | 대만 | 타이베이 | 리엔트리·레벨 적응 | 리엔트리·레벨 적응 | 딥스택 리버 베팅 |
| `future_chen_xiaoyu` | Chen Xiaoyu | 중국 | 마카오 | 딥스택 오버벳 | 딥스택 오버벳 | ICM 생존 전략 |
| `future_sato_ren` | Sato Ren | 일본 | 도쿄 | 정교한 프리플랍 설계 | 정교한 프리플랍 설계 | 상대의 비표준 베팅 사이즈 |
| `future_nakamura_emi` | Nakamura Emi | 일본 | 오사카 | 높은 집중력과 밸류 정확도 | 높은 집중력과 밸류 정확도 | 멀티웨이 변칙 라인 |
| `future_tan_meilin` | Tan Mei Lin | 싱가포르 | 싱가포르 | 빈도 관리와 소액 팟 누적 | 빈도 관리와 소액 팟 누적 | 극단적 숏스택 |
| `future_nguyen_minh` | Nguyen Minh | 베트남 | 호찌민 | 15BB 리스틸 | 15BB 리스틸 | 100BB 딥스택 |
| `future_somchai_arin` | Somchai Arin | 태국 | 방콕 | 플레이어 분포 읽기 | 플레이어 분포 읽기 | 쇼트핸디드 HU |
| `future_arjun_mehta` | Arjun Mehta | 인도 | 뭄바이 | 노이즈가 큰 상황의 판단 | 노이즈가 큰 상황의 판단 | 약한 상대의 랜덤 콜 |
| `future_putri_wijaya` | Putri Wijaya | 인도네시아 | 자카르타 | PKO 타깃 선택 | PKO 타깃 선택 | 티켓 새틀라이트 |
| `future_delacruz_isa` | Isa Dela Cruz | 필리핀 | 마닐라 | 긴 대회 피로도 관리 | 긴 대회 피로도 관리 | 빠른 H2H 적응 |
| `future_lucas_ward` | Lucas Ward | 미국 | 라스베이거스 | ICM에서 압박 | ICM에서 압박 | 낮은 바이인의 멀티웨이 |
| `future_ava_bennett` | Ava Bennett | 미국 | 시애틀 | 텍스처별 컨티뉴에이션 베팅 | 텍스처별 컨티뉴에이션 베팅 | 숏덱 경험 없음 |
| `future_noah_reed` | Noah Reed | 미국 | 마이애미 | 패턴 발견 후 빠른 적응 | 패턴 발견 후 빠른 적응 | 약한 상대의 수동 콜 |
| `future_sofia_morales` | Sofía Morales | 멕시코 | 멕시코시티 | 라이브 토너먼트 테이블 읽기 | 라이브 토너먼트 테이블 읽기 | 온라인 초고빈도 전투 |
| `future_camila_rojas` | Camila Rojas | 칠레 | 산티아고 | 1대1 진입 승률 관리 | 1대1 진입 승률 관리 | 3웨이 최종 테이블 |
| `future_leo_marchand` | Léo Marchand | 프랑스 | 파리 | 정교한 4벳과 블로커 | 정교한 4벳과 블로커 | 상대의 과도한 림프 |
| `future_elena_voss` | Elena Voss | 독일 | 베를린 | 리버 베팅 사이징 | 리버 베팅 사이징 | 급격한 블라인드 상승 |
| `future_matteo_ricci` | Matteo Ricci | 이탈리아 | 몬테카를로 | 밸류와 압박 균형 | 밸류와 압박 균형 | 지속적인 상대 분석 |
| `future_ines_costa` | Inês Costa | 포르투갈 | 리스본 | 견고한 기본기와 블라인드 방어 | 견고한 기본기와 블라인드 방어 | 파이널 테이블 긴장 |
| `future_oliver_brooks` | Oliver Brooks | 영국 | 런던 | 상대 유형별 익스플로잇 | 상대 유형별 익스플로잇 | 막판 ICM |
| `future_bae_junseo` | 배준서 | 대한민국 | 대구 | 현상금 분산과 중간스택 압박 | 현상금 분산과 중간스택 압박 | 초반 지나친 바운티 사냥 |
| `future_moon_siyeon` | 문시연 | 대한민국 | 광주 | 턴 오버벳과 스택 설계 | 턴 오버벳과 스택 설계 | 플랍 과소 방어 |
| `future_oh_chaewon` | 오채원 | 대한민국 | 대전 | 헤즈업 버튼 넓은 오픈 | 헤즈업 버튼 넓은 오픈 | 3벳 팟에서의 과한 수동성 |
| `future_lim_gyeongmin` | 임경민 | 대한민국 | 수원 | 새틀라이트 버블 생존 | 새틀라이트 버블 생존 | 다른 유형 대회에 버블 논리 오용 |
| `future_joo_yechan` | 주예찬 | 대한민국 | 창원 | 블라인드 스틸과 전투적 3벳 | 블라인드 스틸과 전투적 3벳 | 리버 빈도 분산 |
| `future_nam_sohee` | 남소희 | 대한민국 | 전주 | 재진입 가치 판단과 레이트 레지 | 재진입 가치 판단과 레이트 레지 | 첫 진입 때 지나친 인내 |
| `future_baek_eunji` | 백은지 | 대한민국 | 제주 | 멀티데이 후반 딥스택 운영 | 멀티데이 후반 딥스택 운영 | 초반 소액 팟에서 레이즈 부족 |
| `future_ryu_haon` | 류하온 | 대한민국 | 울산 | 중간 스택의 대담한 4벳 | 중간 스택의 대담한 4벳 | 상대가 느리게 밸류를 취할 때 |
| `future_kao_shiming` | Kao Shiming | 대만 | 타이베이 | 안정적인 쇼다운 선택 | 안정적인 쇼다운 선택 | 높은 앤티에 늦은 조정 |
| `future_wei_ling` | Wei Ling | 중국 | 상하이 | 진입/제거확률의 비교 | 진입/제거확률의 비교 | 바운티 저평가 상대 읽기 |
| `future_hayashi_kaito` | Hayashi Kaito | 일본 | 오사카 | 절제된 프리플랍 오픈 | 절제된 프리플랍 오픈 | 고정된 3벳 밸류 레인지 |
| `future_hoshino_yuna` | Hoshino Yuna | 일본 | 도쿄 | 낮은 SPR에서의 올인 대응 | 낮은 SPR에서의 올인 대응 | 복잡한 멀티웨이 플랍 |
| `future_rahul_sen` | Rahul Sen | 인도 | 뭄바이 | 10~20BB 푸시 폴드 | 10~20BB 푸시 폴드 | 100BB 이상 딥스택 전환 |
| `future_priya_kapoor` | Priya Kapoor | 인도 | 벵갈루루 | 프리플랍 방어의 균형 | 프리플랍 방어의 균형 | 리버 블러프 캐치 과도 |
| `future_ng_kaiwen` | Ng Kai Wen | 싱가포르 | 싱가포르 | 베팅 크기별 폴드 유도 | 베팅 크기별 폴드 유도 | 초기 진입 수동성 |
| `future_hafiz_rahman` | Hafiz Rahman | 말레이시아 | 쿠알라룸푸르 | 딥스택 헤즈업 칼링 | 딥스택 헤즈업 칼링 | 버블에서 위험 감수 과다 |
| `future_tran_anh` | Tran Anh | 베트남 | 하노이 | 쇼다운 가치 극대화 | 쇼다운 가치 극대화 | 거친 오버벳을 만날 때 |
| `future_arisa_suwan` | Arisa Suwan | 태국 | 방콕 | 짧은 스택의 과감한 승부 | 짧은 스택의 과감한 승부 | 리버 큰 팟에서 폴드 과다 |
| `future_aziz_khan` | Aziz Khan | 파키스탄 | 라호르 | 저변동 누적과 팟 컨트롤 | 저변동 누적과 팟 컨트롤 | 느린 상승장에서 실력 과대평가 |
| `future_maya_santos` | Maya Santos | 필리핀 | 마닐라 | 빠른 적응과 3벳 빈도 조절 | 빠른 적응과 3벳 빈도 조절 | 중후반 ICM 분산 |
| `future_samuel_kerr` | Samuel Kerr | 호주 | 멜버른 | 스택 대비 팟비율 기반 오버벳 | 스택 대비 팟비율 기반 오버벳 | 장시간 토너먼트 인내 |
| `future_zoe_hart` | Zoe Hart | 뉴질랜드 | 오클랜드 | 와이드 레인지의 플랍 적극성 | 와이드 레인지의 플랍 적극성 | 멀티웨이 리버 밸류 조절 |
| `future_mila_kovacs` | Mila Kovács | 헝가리 | 부다페스트 | 적응력 높은 컷오프/버튼 압박 | 적응력 높은 컷오프/버튼 압박 | 패시브 빅블라인드 공략 과소 |
| `future_anna_weber` | Anna Weber | 독일 | 베를린 | 파이널 테이블 점프 설계 | 파이널 테이블 점프 설계 | 현금 게임으로의 전략 전환 |
| `future_leonard_fischer` | Leonard Fischer | 독일 | 함부르크 | 리버 블로커 활용 | 리버 블로커 활용 | 버블 근처 레이즈 조절 |
| `future_eva_novak` | Eva Novák | 체코 | 프라하 | 4벳 팟 균형과 3벳 방어 | 4벳 팟 균형과 3벳 방어 | 과도한 극소 베팅 |
| `future_olivier_morel` | Olivier Morel | 프랑스 | 파리 | 빠른 의사결정과 블라인드 스틸 | 빠른 의사결정과 블라인드 스틸 | 딥스택에서 스몰팟 유실 |
| `future_lucia_ferrer` | Lucía Ferrer | 스페인 | 바르셀로나 | 멀티 스트리트 밸류 극대화 | 멀티 스트리트 밸류 극대화 | 리버 블러프 비중 낮음 |
| `future_rafael_silva` | Rafael Silva | 브라질 | 상파울루 | 넓은 콜 레인지와 현상금 고려 | 넓은 콜 레인지와 현상금 고려 | 현상금 없이 큰 팟에 과소적응 |
| `future_ana_lima` | Ana Lima | 브라질 | 리우데자네이루 | 숏스택 리스크 관리 | 숏스택 리스크 관리 | 버튼 3벳 대응 지나친 폴드 |
| `future_evan_parker` | Evan Parker | 미국 | 라스베이거스 | 긴 시리즈의 컨디션 유지 | 긴 시리즈의 컨디션 유지 | 상대가 미니멈 레이즈로 함정 설정 |
| `future_chelsea_rogers` | Chelsea Rogers | 미국 | 뉴욕 | 높은 볼륨과 위치별 레인지 | 높은 볼륨과 위치별 레인지 | 장시간 라이브 프레임 전환 |
| `future_owen_mitchell` | Owen Mitchell | 캐나다 | 토론토 | 상대 체크 전략의 패턴 읽기 | 상대 체크 전략의 패턴 읽기 | ICM이 큰 파이널 테이블 |
| `future_isabel_reyes` | Isabel Reyes | 멕시코 | 멕시코시티 | 소규모 팟 누적과 블라인드 방어 | 소규모 팟 누적과 블라인드 방어 | 딥스택 오버벳 상대 |
| `future_luna_ortega` | Luna Ortega | 아르헨티나 | 부에노스아이레스 | 세미블러프·드로우 연계 | 세미블러프·드로우 연계 | 낮은 SPR 올인 결정 |
| `future_diego_mendes` | Diego Mendes | 포르투갈 | 리스본 | 포지션 없는 상황의 균형된 체크 | 포지션 없는 상황의 균형된 체크 | 프리플랍 림프 유인 전략 |

## 고정 로스터 (기존 POKER ARENA, 15명)
- `r-han` 돌부처 한 — 좋은 카드가 올 때까지 몇 시간이고 기다린다.
- `r-sunja` 순자 여사 — 레이즈하면 테이블이 조용해진다.
- `r-park` 박 선생 — 계산대로만 움직이는 은퇴 교사.
- `r-lina` 리나 — 넓게 열고 크게 친다. 압박이 무기.
- `r-teo` 태오 — 리레이즈를 즐기는 젊은 레귤러.
- `r-jihoon` 번개 지훈 — 손이 생각보다 먼저 나간다.
- `r-mia` 미아 — 어떤 스타일인지 알았다고 생각하는 순간 바뀐다.
- `r-dokkaebi` 도깨비 준 — 가끔 이해할 수 없을 만큼 공격적이다.
- `r-haru` 하루 — 넓은 범위, 예측 불가의 리듬.
- `r-ghost` 고스트 — 강한 패를 숨기고 기다린다.
- `r-seoyeon` 여우 서연 — 체크 뒤에 칼이 있다.
- `r-noel` 노을 — 슬로우플레이의 장인.
- `r-nova` NOVA — 전직 딜러. 실수가 없고 습관을 외운다.
- `r-dr` 닥터 한 — 포지션과 레인지로 수술하듯 이긴다.
- `r-ian` 이안 — 균형 잡힌 숙련 레귤러.

대표 선수 90명은 **상한이 아니다.** 월드에는 이 외에 결정론적으로 생성된 레귤러 1,500명이 더 등록되어 있고(등록부 합계 1,605명) 서버는 실제 가입자를 같은 등록부에 무제한으로 추가한다.
