# 다했니? - 학습루틴 게이미피케이션 시스템

학생들의 학습 동기를 높이기 위한 교육용 게이미피케이션 웹 애플리케이션입니다.

### 주요 기능

- **교사용**
  - 반 관리 및 학생 관리
  - 쿠키(포인트) 동기화 및 배분
  - 팀 배틀 게임 진행
  - 상점 관리

- **학생용**
  - 개인 대시보드
  - 학습 기록 잔디(Grass) 추적
  - 미니게임 참여 (숫자야구, 끝말잇기, 총알피하기, 가위바위보, 쿠키배틀 등)
  - 상점에서 아이템 구매
  - 프로필 커스터마이징

### 핵심 컨셉

게임 내 자원(쿠키)은 **변화량** 기반으로 운영되어, 기존 쿠키 보유량과 상관없이 누구나 노력에 따라 공정하게 경쟁할 수 있습니다.

## 시스템 요구사항

- **Node.js**: 18.x 이상 (20.x 권장)
- **npm**: 9.x 이상
- **브라우저**: Chrome, Firefox, Safari, Edge 최신 버전

## 기술 스택

| 분류 | 기술 |
|------|------|
| 프론트엔드 | React 18, TypeScript, Vite |
| 스타일링 | Tailwind CSS v4 |
| UI 컴포넌트 | Radix UI, shadcn/ui |
| 백엔드/DB | Firebase (Auth, Firestore, Storage) |
| 차트 | ECharts, Recharts |
| 외부 API | Dahandin API (api.dahandin.com) |

## 설치 및 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. 개발 서버 실행

```bash
npm run dev
```

개발 서버가 `http://localhost:5173`에서 실행됩니다.

### 3. 프로덕션 빌드

```bash
npm run build
```

빌드 결과물이 `dist/` 폴더에 생성됩니다.

## 배포

Firebase Hosting을 통해 배포됩니다.

```bash
# 호스팅만 배포
npx firebase deploy --only hosting

# Firestore 규칙만 배포
npx firebase deploy --only firestore:rules

# 전체 배포
npx firebase deploy
```

**배포 URL**: https://dahatni-dbe19.web.app

## 프로젝트 구조

```
src/
├── App.tsx              # 라우팅 (쿼리 파라미터 기반)
├── contexts/            # React Context (인증, 게임, 학생 정보)
├── services/            # Firebase 및 API 서비스
├── pages/               # 메인 페이지들
├── games/               # 미니게임 컴포넌트
├── components/          # 공통 UI 컴포넌트
├── types/               # TypeScript 타입 정의
└── utils/               # 유틸리티 함수
```

## 라이선스

Copyright © 2025 신도경T, 김용현T. All rights reserved.
