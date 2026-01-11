/**
 * メインアプリケーションロジック
 * 問題表示、回答管理、レビューフロー制御
 */

const QuizApp = {
    questions: [],
    currentIndex: 0,
    selectedAnswer: null,
    correctAnswerIndex: null, // シャッフル後の正解のインデックス
    reviewerName: '',
    category: '',
    quizPath: '',
    currentReviewId: null, // 現在の回答のレビューID
    missingQuestionsMode: false, // 未保存問題モードかどうか
    missingQuestionIndexes: [], // 未保存問題のインデックス配列
    currentMissingIndex: 0, // 未保存問題モードでの現在位置

    /**
     * アプリケーション初期化
     */
    async init() {
        // localStorageから情報を取得
        this.reviewerName = localStorage.getItem('current_reviewer');
        this.category = localStorage.getItem('current_category');
        this.quizPath = localStorage.getItem('current_quiz_path');

        // 未保存問題モードのチェック
        const missingMode = sessionStorage.getItem('missing_questions_mode');
        if (missingMode === 'true') {
            this.missingQuestionsMode = true;
            sessionStorage.removeItem('missing_questions_mode');
        }

        // 必須情報がない場合はホームにリダイレクト
        if (!this.reviewerName || !this.category || !this.quizPath) {
            alert('レビューアー情報が見つかりません。ホーム画面から開始してください。');
            window.location.href = 'index.html';
            return;
        }

        // UIの初期化
        this.setupUI();

        // 問題データの読み込み
        await this.loadQuestions();
    },

    /**
     * UIの初期化
     */
    setupUI() {
        // イベントリスナーの設定
        document.getElementById('submit-btn').addEventListener('click', () => this.submitAnswer());
        document.getElementById('next-btn').addEventListener('click', () => this.nextQuestion());
        document.getElementById('complete-btn').addEventListener('click', () => this.completeReview());

        // ホームに戻るボタン
        document.getElementById('back-home-btn').addEventListener('click', () => this.goHome());
        document.getElementById('error-home-btn').addEventListener('click', () => this.goHome(false));

        // 再試行ボタン
        document.getElementById('retry-btn').addEventListener('click', () => this.loadQuestions());
    },

    /**
     * 問題データの読み込み
     */
    async loadQuestions() {
        this.showLoading();

        try {
            const data = await GitHubLoader.fetch(this.quizPath);

            // データが配列かどうか確認
            if (!Array.isArray(data)) {
                throw new Error('問題データの形式が不正です（配列である必要があります）');
            }

            // データの検証
            if (data.length === 0) {
                throw new Error('問題データが空です');
            }

            // カテゴリでフィルタリング
            const filteredQuestions = data.filter(q => q.category === this.category);

            if (filteredQuestions.length === 0) {
                throw new Error(`カテゴリ「${this.category}」の問題が見つかりませんでした`);
            }

            // 問題はシャッフルしない（順番通り）
            this.questions = filteredQuestions;

            // 未保存問題モードの処理
            if (this.missingQuestionsMode) {
                console.log('未保存問題モード: S3に保存されていない問題を特定中...');
                this.missingQuestionIndexes = await StorageManager.getMissingQuestions(
                    this.reviewerName,
                    this.category,
                    this.questions
                );

                if (this.missingQuestionIndexes.length === 0) {
                    alert('全ての問題がサーバーに保存されています！');
                    window.location.href = 'index.html';
                    return;
                }

                console.log(`未保存の問題: ${this.missingQuestionIndexes.length}問`);
                alert(
                    `⚠️ ${this.questions.length}問全てを解き終わっていますが、\n` +
                    `途中の${this.missingQuestionIndexes.length}問がサーバーに保存されていません。\n\n` +
                    `これらの問題を解き直してください。`
                );

                // 未保存問題モードでは最初の未保存問題から開始
                this.currentMissingIndex = 0;
                this.currentIndex = this.missingQuestionIndexes[0];

                // 問題数の表示（未保存問題数）
                document.getElementById('total-questions').textContent = this.missingQuestionIndexes.length;

                // 最初の問題を表示
                this.showQuestion();
                this.hideLoading();
                return;
            }

            // 通常モード: 進捗があればそこから開始、なければ0から
            const progress = await StorageManager.getProgress(this.reviewerName, this.category);

            // index.htmlから来た場合は既に確認済み（resume_confirmedフラグをチェック）
            const resumeConfirmed = sessionStorage.getItem('resume_confirmed');

            // 240問目まで到達している場合：未保存問題をチェック
            if (progress && progress.questionIndex >= this.questions.length - 1 && resumeConfirmed !== 'true') {
                console.log('240問目まで到達：未保存問題をチェック中...');

                // 未保存問題をチェック
                this.missingQuestionIndexes = await StorageManager.getMissingQuestions(
                    this.reviewerName,
                    this.category,
                    this.questions
                );

                if (this.missingQuestionIndexes.length > 0) {
                    // 未保存問題がある場合：専用モーダルを表示
                    const choice = await this.showMissingQuestionsResumeModal(
                        this.missingQuestionIndexes.length,
                        this.questions.length
                    );

                    if (choice === 'solve-missing') {
                        // 未保存問題モードで開始
                        this.missingQuestionsMode = true;
                        this.currentMissingIndex = 0;
                        this.currentIndex = this.missingQuestionIndexes[0];

                        // 問題数の表示（未保存問題数）
                        document.getElementById('total-questions').textContent = this.missingQuestionIndexes.length;

                        console.log(`未保存問題モードで開始: ${this.missingQuestionIndexes.length}問`);

                        // 最初の問題を表示
                        this.showQuestion();
                        this.hideLoading();
                        return;
                    } else if (choice === 'cancel') {
                        // キャンセル: ホームに戻る
                        window.location.href = 'index.html';
                        return;
                    }
                } else {
                    // 未保存問題がない場合：完了メッセージを表示
                    alert(`✅ 全ての問題を解き終わっています\n\n${this.questions.length}問全てがサーバーに保存されています。\n\nレビューは完了しています。`);
                    window.location.href = 'index.html';
                    return;
                }
            }
            // 途中まで解いている場合
            else if (progress && progress.questionIndex >= 0 && progress.questionIndex < this.questions.length) {
                if (resumeConfirmed === 'true') {
                    // index.htmlで既に確認済み
                    this.currentIndex = progress.questionIndex;
                    console.log('進捗から再開:', this.currentIndex);
                    sessionStorage.removeItem('resume_confirmed');
                } else {
                    // 直接アクセスの場合は確認モーダルを表示
                    const nextQuestion = progress.questionIndex + 1;
                    const choice = await this.showProgressResumeModal(nextQuestion, this.questions.length);

                    if (choice === 'continue') {
                        this.currentIndex = progress.questionIndex;
                        console.log('進捗から再開:', this.currentIndex);
                    } else if (choice === 'restart') {
                        this.currentIndex = 0;
                        console.log('最初から開始');
                    } else {
                        // キャンセル: ホームに戻る
                        window.location.href = 'index.html';
                        return;
                    }
                }
            }
            // 進捗がない場合（はじめての人）
            else {
                this.currentIndex = 0;
            }

            // 問題数の表示
            document.getElementById('total-questions').textContent = this.questions.length;

            // 最初の問題を表示
            this.showQuestion();
            this.hideLoading();

        } catch (error) {
            console.error('問題読み込みエラー:', error);
            this.showError(error.message);
        }
    },

    /**
     * 問題を表示
     */
    showQuestion() {
        const question = this.questions[this.currentIndex];

        // 問題文の表示
        document.getElementById('question-text').textContent = question.question;

        // 進捗の更新（未保存問題モードかどうかで表示を変える）
        if (this.missingQuestionsMode) {
            // 未保存問題モード: 未保存問題の中での位置を表示
            document.getElementById('current-question').textContent = this.currentMissingIndex + 1;
            const progress = ((this.currentMissingIndex + 1) / this.missingQuestionIndexes.length) * 100;
            document.getElementById('progress-fill').style.width = `${progress}%`;
        } else {
            // 通常モード
            document.getElementById('current-question').textContent = this.currentIndex + 1;
            const progress = ((this.currentIndex + 1) / this.questions.length) * 100;
            document.getElementById('progress-fill').style.width = `${progress}%`;
        }

        // 状態のリセット
        this.selectedAnswer = null;
        this.currentReviewId = null;
        document.getElementById('comment-input').value = '';

        // コメント欄と結果セクションを非表示にしてアニメーションクラスを削除
        const commentSection = document.getElementById('comment-section');
        const resultSection = document.getElementById('result-section');
        commentSection.classList.remove('show');
        resultSection.classList.remove('show');
        commentSection.style.display = 'none';
        resultSection.style.display = 'none';

        document.getElementById('submit-btn').disabled = true;
        document.getElementById('submit-btn').style.display = 'block';
        document.getElementById('next-btn').style.display = 'none';
        document.getElementById('complete-btn').style.display = 'none';

        // 選択肢の生成（correctAnswerIndexが設定される）
        this.renderChoices(question.choice, question.answer);
    },

    /**
     * 選択肢を描画
     * @param {Array} choices - 選択肢の配列
     * @param {string} correctAnswer - 正解の選択肢テキスト（オプション）
     */
    renderChoices(choices, correctAnswer) {
        const container = document.getElementById('choices-container');
        container.innerHTML = '';

        // 正解の位置を見つける
        if (correctAnswer) {
            // answerフィールドがある場合: そのテキストと一致する選択肢を正解とする
            this.correctAnswerIndex = choices.findIndex(c => c === correctAnswer);
        } else {
            // answerフィールドがない場合: インデックス0を正解とする（後方互換性）
            this.correctAnswerIndex = 0;
        }

        // 正解が見つからない場合の警告
        if (this.correctAnswerIndex === -1) {
            console.warn('正解が見つかりません:', correctAnswer, choices);
            this.correctAnswerIndex = 0; // フォールバック
        }

        // 選択肢をそのまま表示（シャッフルしない）
        choices.forEach((choice, index) => {
            const button = document.createElement('button');
            button.className = 'choice-btn';
            button.textContent = choice;
            button.dataset.index = index;

            button.addEventListener('click', () => this.selectAnswer(index));

            container.appendChild(button);
        });
    },

    /**
     * 回答を選択
     * @param {number} index - 選択肢のインデックス
     */
    selectAnswer(index) {
        // 既に提出済みの場合は選択できない
        if (this.selectedAnswer !== null && document.getElementById('result-section').style.display !== 'none') {
            return;
        }

        this.selectedAnswer = index;

        // すべての選択肢からselectedクラスを削除
        document.querySelectorAll('.choice-btn').forEach(btn => {
            btn.classList.remove('selected');
        });

        // 選択した選択肢にselectedクラスを追加
        document.querySelector(`.choice-btn[data-index="${index}"]`).classList.add('selected');

        // 提出ボタンを有効化
        document.getElementById('submit-btn').disabled = false;
    },

    /**
     * 回答を提出
     */
    async submitAnswer() {
        if (this.selectedAnswer === null || this.correctAnswerIndex === null) {
            return;
        }

        const question = this.questions[this.currentIndex];
        const isCorrect = this.selectedAnswer === this.correctAnswerIndex;

        // 画面に表示されている選択肢のテキストを取得
        const choiceButtons = document.querySelectorAll('.choice-btn');
        const selectedText = choiceButtons[this.selectedAnswer].textContent;
        const correctText = choiceButtons[this.correctAnswerIndex].textContent;

        // 結果を保存（コメントは空で保存）
        this.currentReviewId = StorageManager.saveResult({
            questionId: question.questionID,
            questionSet: this.category,
            questionIndex: this.currentIndex,
            keyword: question.keyword,
            category: question.category,
            questionText: question.question,
            reviewerName: this.reviewerName,
            answer: selectedText,        // 選択した選択肢のテキスト
            correctAnswer: correctText,  // 正解の選択肢のテキスト
            isCorrect: isCorrect,
            comment: '' // コメントは後で入力
        });

        // === 先に結果を表示（ユーザーに即座にフィードバック） ===

        // 結果表示
        this.showResult(isCorrect, selectedText, correctText);

        // 選択肢に色をつける（アニメーション後に実行）
        setTimeout(() => {
            this.highlightChoices(this.correctAnswerIndex);
        }, 300);

        // ボタンの切り替え
        document.getElementById('submit-btn').style.display = 'none';

        // 未保存問題モードの場合
        if (this.missingQuestionsMode) {
            if (this.currentMissingIndex < this.missingQuestionIndexes.length - 1) {
                document.getElementById('next-btn').style.display = 'block';
            } else {
                document.getElementById('complete-btn').style.display = 'block';
            }
        } else {
            // 通常モード
            if (this.currentIndex < this.questions.length - 1) {
                document.getElementById('next-btn').style.display = 'block';
            } else {
                document.getElementById('complete-btn').style.display = 'block';
            }
        }

        // 選択肢を無効化
        document.querySelectorAll('.choice-btn').forEach(btn => {
            btn.disabled = true;
        });

        // コメント欄を表示して入力可能にする（結果表示後に実行）
        setTimeout(() => {
            const commentSection = document.getElementById('comment-section');
            commentSection.style.display = 'block';
            setTimeout(() => {
                commentSection.classList.add('show');
            }, 10);
            document.getElementById('comment-input').disabled = false;
            setTimeout(() => {
                document.getElementById('comment-input').focus();
            }, 500); // アニメーション後にフォーカス
        }, 800); // 結果表示と選択肢ハイライトの後

        // 注意: サーバー送信は「次の問題へ」ボタンを押した時に行われます
    },

    /**
     * サーバーへの保存（再試行付き）
     * @param {Object} reviewData - レビューデータ
     */
    async saveToServerWithRetry(reviewData) {
        const maxRetries = 3;
        let saveSuccess = false;
        let retryCount = 0;

        while (!saveSuccess && retryCount < maxRetries) {
            try {
                const saveResult = await StorageManager.saveReviewToAPI(reviewData);
                if (saveResult) {
                    saveSuccess = true;
                    console.log('サーバーへの保存に成功しました');
                    return; // 成功したら終了
                }
            } catch (error) {
                console.error(`API送信エラー (試行${retryCount + 1}回目):`, error);
            }

            retryCount++;

            // 保存失敗時の処理
            if (!saveSuccess) {
                if (retryCount < maxRetries) {
                    // まだ再試行できる場合
                    const retry = confirm(
                        `⚠️ 回答の保存に失敗しました（${retryCount}回目）\n\n` +
                        `お使いのブラウザには保存されていますが、サーバーへの保存に失敗しています。\n\n` +
                        `もう一度送信しますか？\n\n` +
                        `OK: もう一度送信する\n` +
                        `キャンセル: スキップ（後で解き直せます）`
                    );

                    if (!retry) {
                        // ユーザーが「スキップ」を選択
                        console.warn('ユーザーが再試行をキャンセルしました');
                        break;
                    }
                    // retryがtrueの場合はループを続けて再試行
                } else {
                    // 最大試行回数に達した場合
                    alert(
                        `⚠️ 回答の保存に${maxRetries}回失敗しました\n\n` +
                        `お使いのブラウザには保存されていますが、サーバーへの保存ができませんでした。\n\n` +
                        `ネットワーク接続を確認してください。\n\n` +
                        `この問題は後でまとめて解き直すことができます。`
                    );
                    break;
                }
            }
        }

        if (!saveSuccess) {
            console.warn('サーバーへの保存に失敗しました。後で解き直してください。');
        }
    },

    /**
     * 結果を表示
     * @param {boolean} isCorrect - 正解かどうか
     * @param {string} yourAnswer - 選択した回答
     * @param {string} correctAnswer - 正解
     */
    showResult(isCorrect, yourAnswer, correctAnswer) {
        const resultSection = document.getElementById('result-section');
        const resultHeader = document.getElementById('result-header');
        const resultIcon = document.getElementById('result-icon');
        const resultTitle = document.getElementById('result-title');

        // 正誤に応じた表示
        if (isCorrect) {
            resultHeader.className = 'result-header correct';
            resultIcon.textContent = '✓';
            resultTitle.textContent = '正解！';
        } else {
            resultHeader.className = 'result-header incorrect';
            resultIcon.textContent = '✗';
            resultTitle.textContent = '不正解';
        }

        // 回答の表示
        document.getElementById('your-answer').textContent = yourAnswer;
        document.getElementById('correct-answer').textContent = correctAnswer;

        // 結果セクションを表示（アニメーション付き）
        resultSection.style.display = 'block';
        setTimeout(() => {
            resultSection.classList.add('show');
            // 結果セクションまでぬるっとスクロール
            setTimeout(() => {
                resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
        }, 10);
    },

    /**
     * 選択肢をハイライト
     * @param {number} correctIndex - 正解のインデックス
     */
    highlightChoices(correctIndex) {
        document.querySelectorAll('.choice-btn').forEach((btn, index) => {
            if (index === correctIndex) {
                btn.classList.add('correct');
            } else if (index === this.selectedAnswer) {
                btn.classList.add('incorrect');
            }
        });
    },

    /**
     * 次の問題へ
     */
    async nextQuestion() {
        // コメントを保存してサーバーに送信
        if (this.currentReviewId) {
            const comment = document.getElementById('comment-input').value.trim();
            StorageManager.updateComment(this.currentReviewId, comment);

            // localStorageから最新のレビューデータを取得してサーバーに送信
            const results = StorageManager.getAllResults();
            const reviewData = results.find(r => r.review_id === this.currentReviewId);
            if (reviewData) {
                // サーバーに送信（再試行付き）
                await this.saveToServerWithRetry(reviewData);
            }
        }

        // 進捗を保存（未保存問題モードでは保存しない）
        if (!this.missingQuestionsMode) {
            await StorageManager.saveProgress(this.reviewerName, this.category, this.currentIndex);
        }

        // 未保存問題モードの場合
        if (this.missingQuestionsMode) {
            if (this.currentMissingIndex < this.missingQuestionIndexes.length - 1) {
                this.currentMissingIndex++;
                this.currentIndex = this.missingQuestionIndexes[this.currentMissingIndex];
                this.showQuestion();
            }
            return;
        }

        // 通常モード
        if (this.currentIndex < this.questions.length - 1) {
            this.currentIndex++;
            this.showQuestion();
        }
    },

    /**
     * レビュー完了
     */
    async completeReview() {
        // 最後の問題のコメントを保存してサーバーに送信
        if (this.currentReviewId) {
            const comment = document.getElementById('comment-input').value.trim();
            StorageManager.updateComment(this.currentReviewId, comment);

            // localStorageから最新のレビューデータを取得してサーバーに送信
            const results = StorageManager.getAllResults();
            const reviewData = results.find(r => r.review_id === this.currentReviewId);
            if (reviewData) {
                // サーバーに送信（再試行付き）
                await this.saveToServerWithRetry(reviewData);
            }
        }

        // 未保存問題モードの場合は異なるメッセージ
        if (this.missingQuestionsMode) {
            alert(
                `✅ 未保存問題の解き直しが完了しました！\n\n` +
                `途中の${this.missingQuestionIndexes.length}問をサーバーに保存しました。\n\n` +
                `全ての問題を解き終わっています。\n\n` +
                `お疲れさまでした！`
            );
            window.location.href = 'index.html';
            return;
        }

        // 通常モード: 進捗を削除（レビュー完了）
        StorageManager.clearProgress(this.reviewerName, this.category);

        const stats = StorageManager.getStatistics();
        const reviewerStats = stats.byReviewer[this.reviewerName];

        const message = `
レビューが完了しました！

📊 あなたの成績:
正解数: ${reviewerStats.correct} / ${reviewerStats.total}
正解率: ${reviewerStats.accuracy}%

お疲れさまでした！
        `.trim();

        alert(message);

        // ホームに戻る
        window.location.href = 'index.html';
    },

    /**
     * 未保存問題確認モーダルを表示（240問目まで到達したが途中が抜けている場合）
     * @param {number} missingCount - 未保存問題数
     * @param {number} totalQuestions - 総問題数
     * @returns {Promise<string>} 'solve-missing' | 'cancel'
     */
    showMissingQuestionsResumeModal(missingCount, totalQuestions) {
        return new Promise((resolve) => {
            const modal = document.getElementById('progress-resume-modal');
            const message = document.getElementById('progress-resume-message');
            const continueBtn = document.getElementById('resume-continue-btn');
            const restartBtn = document.getElementById('resume-restart-btn');
            const cancelBtn = document.getElementById('resume-cancel-btn');

            // メッセージを設定
            message.textContent =
                `⚠️ ${totalQuestions}問全てを解き終わっていますが、\n` +
                `途中の${missingCount}問がサーバーに保存されていません。`;

            // ボタンのラベルを変更
            continueBtn.textContent = `未保存の${missingCount}問を解く`;
            restartBtn.style.display = 'none'; // 「最初から開始」ボタンは非表示

            // モーダルを表示
            modal.style.display = 'flex';

            // イベントハンドラー
            const handleSolveMissing = () => {
                modal.style.display = 'none';
                // ボタンのラベルを元に戻す
                continueBtn.textContent = '続きから開始';
                restartBtn.style.display = 'inline-block';
                cleanup();
                resolve('solve-missing');
            };

            const handleCancel = () => {
                modal.style.display = 'none';
                // ボタンのラベルを元に戻す
                continueBtn.textContent = '続きから開始';
                restartBtn.style.display = 'inline-block';
                cleanup();
                resolve('cancel');
            };

            const cleanup = () => {
                continueBtn.removeEventListener('click', handleSolveMissing);
                cancelBtn.removeEventListener('click', handleCancel);
            };

            continueBtn.addEventListener('click', handleSolveMissing);
            cancelBtn.addEventListener('click', handleCancel);
        });
    },

    /**
     * 進捗再開確認モーダルを表示
     * @param {number} nextQuestion - 次の問題番号
     * @param {number} totalQuestions - 総問題数
     * @returns {Promise<string>} 'continue' | 'restart' | 'cancel'
     */
    showProgressResumeModal(nextQuestion, totalQuestions) {
        return new Promise((resolve) => {
            const modal = document.getElementById('progress-resume-modal');
            const message = document.getElementById('progress-resume-message');
            const continueBtn = document.getElementById('resume-continue-btn');
            const restartBtn = document.getElementById('resume-restart-btn');
            const cancelBtn = document.getElementById('resume-cancel-btn');

            // メッセージを設定
            if (nextQuestion > totalQuestions) {
                message.textContent = `全ての問題を解き終わっています。`;
            } else {
                message.textContent = `問題${nextQuestion}/${totalQuestions}から再開できます。`;
            }

            // モーダルを表示
            modal.style.display = 'flex';

            // ボタンのイベントリスナー（一度だけ実行）
            const handleContinue = () => {
                modal.style.display = 'none';
                cleanup();
                resolve('continue');
            };

            const handleRestart = () => {
                modal.style.display = 'none';
                cleanup();
                resolve('restart');
            };

            const handleCancel = () => {
                modal.style.display = 'none';
                cleanup();
                resolve('cancel');
            };

            const cleanup = () => {
                continueBtn.removeEventListener('click', handleContinue);
                restartBtn.removeEventListener('click', handleRestart);
                cancelBtn.removeEventListener('click', handleCancel);
            };

            continueBtn.addEventListener('click', handleContinue);
            restartBtn.addEventListener('click', handleRestart);
            cancelBtn.addEventListener('click', handleCancel);
        });
    },

    /**
     * ホームに戻る
     * @param {boolean} confirm - 確認ダイアログを表示するか
     */
    goHome(confirm = true) {
        if (confirm) {
            const userConfirm = window.confirm('ホームに戻りますか？\n（進捗は保存されます）');
            if (!userConfirm) {
                return;
            }
        }

        window.location.href = 'index.html';
    },

    /**
     * 配列をシャッフル（Fisher-Yatesアルゴリズム）
     * @param {Array} array - シャッフルする配列
     * @returns {Array} シャッフルされた配列
     */
    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    },

    /**
     * ローディング表示
     */
    showLoading() {
        document.getElementById('loading').style.display = 'block';
        document.getElementById('error-container').style.display = 'none';
        document.getElementById('question-container').style.display = 'none';
    },

    /**
     * ローディング非表示
     */
    hideLoading() {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('question-container').style.display = 'block';
    },

    /**
     * エラー表示
     * @param {string} message - エラーメッセージ
     */
    showError(message) {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('question-container').style.display = 'none';
        document.getElementById('error-container').style.display = 'block';
        document.getElementById('error-message').textContent = message;
    }
};

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', () => {
    QuizApp.init();
});
