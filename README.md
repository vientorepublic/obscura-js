# haze.js

Google reCAPTCHA의 난독화, 안티디버깅/템퍼링 기술을 기반으로 하는 TypeScript/JavaScript 코드 보호 도구

## 기능

| 카테고리   | 패스                    | 설명                                                     |
| ---------- | ----------------------- | -------------------------------------------------------- |
| 난독화     | `sequenceExpression`    | `if` 블록을 쉼표 시퀀스 표현식으로 평탄화                |
| 난독화     | `mba`                   | 산술 연산을 혼합 불리언 산술(MBA)로 확장                 |
| 난독화     | `functionTable`         | 함수들을 간접 테이블로 이동, 인덱스로 호출               |
| 난독화     | `stringPool`            | 모든 문자열을 LCG-XOR 암호화 풀로 이동                   |
| 난독화     | `controlFlowFlattening` | 함수 본문을 플랫 상태 기계로 변환                        |
| 난독화     | `deadCode`              | 도달 불가능한 코드 블록 삽입                             |
| 안티디버깅 | `nativeBinding`         | 네이티브 메서드를 미리 바인딩해 Prototype pollution 방어 |
| 안티디버깅 | `integrityTag`          | Symbol 기반 무결성 태그로 객체 복제/교체 탐지            |

## 시작하기

```bash
npm install
npm run build   # dist/ 로 컴파일
npm test        # 테스트 실행
```

## API 사용법

```typescript
import { protect } from "haze-js";

const { code, appliedPasses } = protect(source, {
  obfuscation: {
    mba: { rounds: 2 },
    stringPool: { seed: 1234 },
    controlFlowFlattening: {},
    deadCode: { targetLines: 100 },
  },
  antiDebug: {
    nativeBinding: { methods: ["Math.floor", "Object.defineProperty"] },
    integrityTag: { tagDescription: "jas" },
  },
  minify: true,
});
```

특정 패스를 비활성화하려면 `false`를 전달합니다:

```typescript
protect(source, {
  obfuscation: { deadCode: false, mba: false },
});
```

## CLI 사용법

```bash
npx haze protect input.js -o output.js
npx haze protect input.js --no-dead --no-cff
npx haze protect input.js --sp-seed 9999
npx haze protect input.js --minify
```

### CLI 옵션 전체 목록

| 옵션                  | 설명                                    |
| --------------------- | --------------------------------------- |
| `-o, --output <file>` | 출력 파일 경로                          |
| `--no-seq`            | sequenceExpression 패스 비활성화        |
| `--no-mba`            | MBA 패스 비활성화                       |
| `--no-ft`             | functionTable 패스 비활성화             |
| `--no-sp`             | stringPool 패스 비활성화                |
| `--no-cff`            | controlFlowFlattening 패스 비활성화     |
| `--no-dead`           | deadCode 패스 비활성화                  |
| `--no-native`         | nativeBinding 패스 비활성화             |
| `--no-tag`            | integrityTag 패스 비활성화              |
| `--sp-seed <number>`  | stringPool XOR 시드 값 지정             |
| `--minify`            | 출력 코드 압축 (공백 제거, 리터럴 단축) |

## 레퍼런스

기술 분석 상세 내용은 [docs/reCAPTCHA.md](docs/reCAPTCHA.md) 참조.

## 라이선스

MIT
