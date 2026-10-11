---
name: resolve-conflicts
description: 작업 브랜치를 최신 main 위로 rebase 하면서 충돌을 해결한다. PR이 main과 충돌할 때, "resolve conflict", "충돌 해결", "main 따라가기", "rebase 해줘" 같은 요청에 사용한다.
argument-hint: "[branch]"
---

# Resolve conflicts

작업 브랜치를 최신 `origin/main` 위로 rebase 하고, 그 과정의 충돌을 해결한다. 인자로 브랜치가 주어지면 그 브랜치를, 없으면 현재 브랜치를 대상으로 한다.

이 저장소는 rebase merge만 허용하므로 **`main`을 merge 해서 충돌을 풀지 않는다.** merge 커밋이나 "resolve conflicts" 커밋이 남지 않도록, 충돌은 그것을 일으킨 커밋 안에서 해결한다.

## 1. 준비

- `git status`로 작업 트리가 깨끗한지 확인한다. 커밋되지 않은 변경이 있으면 멈추고 사용자에게 어떻게 할지 묻는다. `git stash`는 다른 worktree와 스택을 공유하므로 쓰지 않는다.
- 대상이 `main`이면 중단한다.
- `git fetch origin main` 후 `git log --oneline origin/main..HEAD`로 옮길 커밋을, `git log --oneline HEAD..origin/main`으로 새로 들어온 커밋을 확인한다.
- 되돌릴 수 있도록 rebase 전 `HEAD`의 SHA를 기록해 둔다.

## 2. Rebase

```bash
git rebase origin/main
```

충돌이 나면 멈춘 커밋마다 다음을 반복한다.

1. `git status`로 충돌 파일을 확인하고, `git show REBASE_HEAD`로 지금 적용 중인 커밋이 원래 무엇을 하려던 것인지 본다.
2. 충돌 파일마다 `git log -p origin/main -- <file>`로 main 쪽이 왜 바뀌었는지 확인한다. 양쪽 의도를 모두 이해한 뒤에 고친다.
3. 양쪽 변경을 모두 살리는 방향으로 해결한다. 한쪽을 통째로 버리는 `--ours` / `--theirs`는 아래 "파일별 규칙"에 해당할 때만 쓴다. rebase 중에는 `ours`가 main, `theirs`가 내 커밋이라는 점에 주의한다.
4. 충돌 마커(`<<<<<<<`, `=======`, `>>>>>>>`)가 남지 않았는지 `git diff --check`로 확인한다.
5. `git add <files>` 후 `git -c core.editor=true rebase --continue`.

해결하면서 그 커밋의 범위를 넘는 수정을 끼워 넣지 않는다. main의 변경 때문에 뒤따라 고쳐야 하는 부분(이름이 바뀐 함수 호출 등)은 그 호출을 추가한 커밋에서 고친다.

양쪽 의도가 실제로 상충해서(같은 동작을 서로 다르게 바꿈) 어느 쪽이 맞는지 코드만으로 판단할 수 없으면, 추측하지 말고 양쪽 변경을 요약해 사용자에게 묻는다. 진행이 꼬이면 `git rebase --abort`로 처음 상태로 돌아간다.

## 3. 파일별 규칙

- **`frontend/pnpm-lock.yaml`, `backend/uv.lock`** — 손으로 합치지 않는다. `git checkout --ours -- <lockfile>`로 main 쪽을 받은 뒤, 먼저 `package.json` / `pyproject.toml`의 충돌을 해결하고 `pnpm install` / `uv sync`로 다시 생성한다.
- **`backend/supabase/migrations/NNNN_*.sql`** — 번호가 main에 새로 들어온 마이그레이션과 겹치면 내 쪽 파일을 다음 번호로 올린다. main에 이미 있는 마이그레이션은 Supabase에 적용됐을 수 있으므로 수정하거나 번호를 바꾸지 않는다. 번호를 바꿨다면 사용자에게 알린다.
- **`backend/app/models/`** — 마이그레이션 SQL이 스키마의 기준이다. 모델 충돌은 합쳐진 마이그레이션 결과와 일치하도록 맞춘다.
- **라우터/프로바이더 등록부, `docs/*.md`의 목록** — 양쪽이 각자 항목을 추가한 경우가 대부분이므로 둘 다 유지한다.

## 4. 검증

텍스트 충돌이 없어도 의미상 깨질 수 있으므로 rebase 가 끝나면 반드시 확인한다.

```bash
cd backend && uv run ruff check . && uv run pytest
cd frontend && pnpm check && pnpm build
```

- 실패하면 원인이 된 커밋을 찾아 `git commit --fixup <sha>` 후 `git -c sequence.editor=true rebase -i --autosquash origin/main`으로 그 커밋에 합친다. 별도의 수정 커밋을 쌓지 않는다.
- `pnpm check`는 파일을 고쳐 쓴다. 변경이 생기면 같은 방식으로 해당 커밋에 합친다.
- `git range-diff <기록해 둔 SHA>...HEAD`(또는 `git range-diff origin/main <old> HEAD`)로 각 커밋이 의도치 않게 달라지지 않았는지 훑어본다.

## 5. Push

브랜치가 이미 원격에 있으면 히스토리가 바뀌었으므로 force push 가 필요하다. **push 는 사용자가 요청했거나 확인한 경우에만** 하고, 항상 `--force-with-lease`를 쓴다.

```bash
git push --force-with-lease -u origin <branch>
```

`main`으로는 절대 push 하지 않는다.

## 6. 보고

- 충돌이 난 커밋과 파일, 각각 어떻게 해결했는지
- 판단이 필요했던 부분과 그 근거
- 검증 명령의 결과 (실패했다면 출력과 함께)
- 마이그레이션 번호 변경 여부, push 여부
