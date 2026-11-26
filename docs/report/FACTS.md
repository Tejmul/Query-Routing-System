# Routing Desk: verified facts for the report, slides and preparation guide

Every number used in any document must come from this file. Do not round differently, do not invent numbers.
**Never state, chart or hint at Laya's accuracy, F1 or any quality score. Laya is compared on TIME ONLY.**
Never mention a "1,000-message sample" or "999" for the Laya comparison.

## Project
- Name: **Routing Desk**, an NLP system that reads customer banking messages, classifies them into five categories and routes each to the right team.
- Authors (in this order): **Tejmul Movin, Samarth Sekhar, Meenaksh Singhania, Prerak Arya**. No affiliation or email is given; do not invent one.
- Five categories and teams:
  | Category | Team (department) | Default priority | SLA |
  |---|---|---|---|
  | Payments | Payments & Transfers Desk | high | 8 h |
  | Cards | Card Services | normal | 24 h |
  | Loans | Lending Team | normal | 48 h |
  | Account issues | Account Services | normal | 24 h |
  | Fraud | Fraud & Security Team | urgent | 1 h |
  Low-confidence messages go to "General Support (manual review)".

## Data
- Banking77 public dataset (Casanueva et al., 2020) plus generated loan queries (Banking77 has no loan intents) plus 1 agent correction.
- Training rows: **10,519** (Banking77 9,974; generated loans 544; agent feedback 1).
- Test rows: **3,192** (payments 1,480; cards 959; loans 113; account 400; fraud 240). Test set is fixed and never trained on.
- Training per category: payments 5,338; cards 2,701; loans 544; account 1,137; fraud 799.
- 83 sub-intents ("topics") under the five categories.

## Model (production, version v20261122-164348)
- Text features: TF-IDF over word n-grams and character n-grams. Classifier: Logistic Regression, C = 20.
- Chosen by 5-fold stratified cross-validation grid search, scored by macro F1:
  | Model | CV macro F1 | Test accuracy | Test macro F1 |
  |---|---|---|---|
  | Majority baseline | 0.1347 | 0.4637 | 0.1267 |
  | Complement Naive Bayes (alpha 0.1) | 0.9396 | 0.9533 | 0.9485 |
  | Linear SVM (C 1.0) | 0.9655 | 0.9671 | 0.9568 |
  | **Logistic Regression (C 20)** | **0.9663** | **0.9734** | **0.9739** |
- Test results: **accuracy 97.34%**, **macro F1 0.9739**, weighted F1 0.9734, **85** of 3,192 misclassified.
- Per category (precision / recall / F1 / support):
  payments 0.9855 / 0.9662 / 0.9758 / 1,480; cards 0.9680 / 0.9791 / 0.9736 / 959; loans 1.0000 / 1.0000 / 1.0000 / 113;
  account 0.9564 / 0.9875 / 0.9717 / 400; fraud 0.9388 / **0.9583** / 0.9485 / 240 (230 of 240 fraud messages caught).
- Topic (sub-intent, 83 classes): accuracy **89.94%**, macro F1 0.8694, top-3 accuracy 96.65%.
- Release check (quality gate) — all passed: macro F1 ≥ 0.93 (0.9739); fraud recall ≥ 0.90 (0.9583); topic accuracy ≥ 0.80 (0.8994); no regression vs previous production beyond 0.01 (0.9739 ≥ 0.9639).
- Training time 36 s. Model file 27.6 MB. Load time 1.6 s.
- Model card, registry with versions, promotion, hot reload.

## Routing rules on top of the model
- PII masking before anything else (card numbers with Luhn check, phone numbers, emails, etc.).
- Fraud safety net: strong fraud phrases always escalate to Fraud; weaker fraud words escalate if the model gives fraud some probability.
- Low confidence (below the review threshold) → manual review.
- Priority overrides from keywords; SLA hours per team, tightened for urgent/high.
- Secondary category reported if the second-best category clears a threshold.

## Phase 1 → now: from 1,000 to 1,000,000+
### Before (previous phase)
- `/api/v1/classify` handled one message per call: about **153 messages per second** per process. 1,000,000 messages would take about **1.8 hours** (1,000,000 / 153 ≈ 6,536 s).
- `/api/v1/classify/batch` and `/api/v1/classify/csv` **refused more than 1,000 messages** per request (HTTP 413, setting `max_batch_size = 1000`). The UI could only show batches up to 1,000.
- Every message: features computed **twice** (separate category and topic pipelines), rules applied one message at a time in Python, a database ticket created per message, the whole request held open until done.
### Now
- **Bulk engine** (`bankq/bulk.py`) and **jobs API** (`/api/v1/jobs`):
  1. Upload once; the file becomes a background job (HTTP 202 + job id). Progress is polled; results download as CSV.
  2. File streamed from disk in **chunks of 20,000 rows** (pandas chunked reader); never fully in memory. CSV rows counted with a real CSV parser (quoted messages can contain line breaks).
  3. **One forward pass per chunk**: text features computed once; the category head and topic head both score the same feature matrix (shared features, one `model.joblib`).
  4. Routing rules applied to the whole chunk as **NumPy array operations** (vectorised). A test proves the bulk router makes **exactly the same decision** as the per-message router.
  5. **Parallel workers**: one process per CPU core (ProcessPoolExecutor, spawn); each loads the model once; bounded queue (workers × 2 chunks in flight); workers format their own CSV output; atomic `.part` → rename; a crashed worker fails the job cleanly.
  6. Live view: each chunk returns 6 real routed sample rows; the UI animates them.
- Measured on an Apple M2 laptop (4 performance + 4 efficiency cores):
  - **13,120 messages/s on 1 core**, **51,799 messages/s with 8 workers**.
  - **1,000,000 messages routed in 19.3 seconds.**
  - Speed-up sources: features once instead of twice; whole-chunk array maths instead of per-message Python; 8 cores instead of 1 (~4× not 8× because 4 cores are slower efficiency cores).
- Same model, same data (fingerprint `2025a09cd7997a7e`): category accuracy unchanged at 97.34%; topic accuracy 89.97% → 89.94% (≈1 message of 3,192) because the topic head now shares the category features.
- Honest limit: this is 1,000,000 messages in a file (batch). 1,000,000 simultaneous users would need several servers, a load balancer and a queue.

## New user interface (Next.js)
- Next.js 16 (App Router, TypeScript), Tailwind CSS v4, Motion animations, clean white design.
- Pages: **Route** (live classification with an animated neural-network view of each decision), **Bulk routing** (drop a file of any size; real routed messages flow from the file through a network into five team bins with live counters and speed), **Inbox** (ticket queue, filters, re-route, notes, history), **Analytics**, **Model** (model report: release check, model comparison, confusion matrix, per-category scores, versions, figures), **Laya** (challenger comparison, time only).
- Note: the neural-network animation is a visual of the computation; the production model itself is TF-IDF + Logistic Regression (no hidden layers).
- Backend: FastAPI, SQLAlchemy (SQLite), Prometheus metrics, API keys, rate limiting, request IDs, CORS for the frontend. **58 automated tests.**

## Laya (challenger) — TIME ONLY
- Laya: open-weights "System 1" decision model by NandhaKishorM / Convai Innovations, GitHub https://github.com/nandhakishorm/laya , Apache 2.0, `pip install laya`. Classic English checkpoint: **ModernBERT-large encoder + decision head, 421M parameters, 808 MB**. You give it a *state* (the message) and *typed questions*; it returns a probability for every option in a single forward pass. It never generates text.
- How we integrated it: optional dependency (`pip install -e ".[laya]"`); adapter `bankq/ml/laya_challenger.py` asks one typed question — "Which banking team should handle this customer message?" — with our five categories and their taxonomy descriptions as options; comparison script `bankq/ml/laya_eval.py`; API `GET /api/v1/model/challengers`; UI page `/laya`. **Switched off: Laya never routes a message.** Asked zero-shot (not trained on our data).
- Measured time (Apple M2; Laya on the M2 GPU via MPS):
  | | Our model | Laya |
  |---|---|---|
  | One message | **2.8 ms** | **63 ms** (22× longer) |
  | Batched throughput | **11,073 msg/s** (1 CPU core, model scoring) | **2.74 msg/s** |
  | 1,000,000 messages | **19.3 s** (bulk, 8 workers) | **≈ 4.2 days** (at 2.74 msg/s) |
  | Start-up (load) | **1.6 s** | **7.9 s** |
  | Size | 27.6 MB | 808 MB |
  - In the time Laya routes one message, our model routes about **4,000** (11,073 / 2.74 ≈ 4,041).
- Why Laya did not replace our model (the "why did it fail" answer, no accuracy):
  1. **Time**: thousands of times slower; 1M messages would take days instead of seconds; needs a GPU to be practical.
  2. **Not trained on our data**: zero-shot, it only had a one-line description of each team; its own authors describe the base checkpoint as "a fast base to specialise, not a zero-shot decision engine". A fair quality comparison needs fine-tuning first (planned: Phase 2 TASKS.md #1, transformer challenger).
  3. **Size / cost**: 808 MB, GPU recommended, vs 27.6 MB on any CPU.
- Why decisions at all, when TF-IDF already segregates the five branches?
  - For a **fixed set of 5 teams with plenty of labelled data**, TF-IDF + Logistic Regression is the right tool: fast, small, accurate, explainable (indicator words). That is why it stays in production.
  - A decision model adds what a fixed classifier cannot do without retraining: **new questions or new teams at request time** (just add an option), **several decisions in one pass** (team, urgency, "is the customer threatening to leave?", "is a refund requested?"), **calibrated probabilities with abstain / prediction sets** (it can say "not sure"), and **100+ languages** with its multilingual checkpoint.
  - Plan: keep TF-IDF for the bulk of traffic; use a decision model only as a second opinion on the small share of low-confidence messages or for new decision types — where its time cost is affordable.

## References (real; use IEEE style)
1. I. Casanueva, T. Temčinas, D. Gerz, M. Henderson, and I. Vulić, "Efficient intent detection with dual sentence encoders," in Proc. 2nd Workshop on NLP for Conversational AI, ACL, 2020, pp. 38–45.
2. G. Salton and C. Buckley, "Term-weighting approaches in automatic text retrieval," Information Processing & Management, vol. 24, no. 5, pp. 513–523, 1988.
3. F. Pedregosa et al., "Scikit-learn: Machine learning in Python," Journal of Machine Learning Research, vol. 12, pp. 2825–2830, 2011.
4. R.-E. Fan, K.-W. Chang, C.-J. Hsieh, X.-R. Wang, and C.-J. Lin, "LIBLINEAR: A library for large linear classification," Journal of Machine Learning Research, vol. 9, pp. 1871–1874, 2008.
5. T. Joachims, "Text categorization with support vector machines: Learning with many relevant features," in Proc. ECML, 1998, pp. 137–142.
6. J. D. M. Rennie, L. Shih, J. Teevan, and D. R. Karger, "Tackling the poor assumptions of naive Bayes text classifiers," in Proc. ICML, 2003, pp. 616–623.
7. J. Devlin, M.-W. Chang, K. Lee, and K. Toutanova, "BERT: Pre-training of deep bidirectional transformers for language understanding," in Proc. NAACL-HLT, 2019, pp. 4171–4186.
8. B. Warner et al., "Smarter, better, faster, longer: A modern bidirectional encoder for fast, memory efficient, and long context finetuning and inference," arXiv:2412.13663, 2024.
9. N. M and A. M, "From Laya to Vega: Open non-autoregressive decision models with calibrated probabilities," Preprints, 2026, doi: 10.20944/preprints202611.0781.v1.
10. S. Ramírez, "FastAPI," 2018. [Online]. Available: https://fastapi.tiangolo.com
11. C. D. Manning, P. Raghavan, and H. Schütze, Introduction to Information Retrieval. Cambridge, U.K.: Cambridge University Press, 2008.

## Figures available in docs/report/figures/ (all verified)
- `throughput.png` — before 153 vs 13,120 (1 core) vs 51,799 (8 workers) msg/s.
- `time_1m.png` — time for 1M messages: ~1.8 h before vs 19.3 s now (log scale).
- `laya_time.png` — our model vs Laya: one message, start-up, 1M messages (time only).
- `per_category.png` — precision/recall/F1 per category (our model).
- `model_selection.png` — CV macro F1 of the four candidates.
- `confusion_matrix.png`, `class_distribution.png`, `model_comparison.png`, `top_terms.png` — from the model registry (training run).
- `ui_route.png` — Route page (neural network view of a fraud message).
- `ui_bulk_live.png` — Bulk routing page mid-run (messages flowing through the network into team bins).
- `ui_laya_time.png` — Laya page, time section (race + time table; no accuracy).
