# 습관 고래

Atomic Habits 실천을 위한 개인 습관 체크/리스트/캘린더 웹 앱입니다.

## 로컬 실행

```bash
npm install
npm run dev
```

로컬 주소:

```txt
http://127.0.0.1:5173/
```

## 환경 변수

프로젝트 루트에 `.env` 파일을 만들고 Supabase 값을 넣습니다.

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
```

`sb_secret_...` 키는 브라우저 앱에 넣지 않습니다.

## Supabase 구성

1. Supabase 프로젝트를 만듭니다.
2. `supabase.schema.sql`을 SQL Editor에서 실행합니다.
3. Authentication에서 Email provider와 Google provider를 켭니다.
4. Google provider에는 Google Cloud에서 만든 Client ID와 Client Secret을 넣습니다.
5. Authentication URL Configuration에 로컬 주소와 배포 주소를 등록합니다.

## Vercel 배포

1. GitHub에 이 프로젝트를 올립니다.
2. Vercel에서 GitHub 저장소를 Import합니다.
3. Framework Preset은 Vite로 둡니다.
4. Environment Variables에 `.env`와 같은 값을 넣습니다.
5. Deploy를 누릅니다.
6. 배포 URL을 Supabase와 Google OAuth redirect 설정에 추가합니다.
