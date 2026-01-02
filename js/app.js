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

    /**
     * アプリケーション初期化
     */
    async init() {
        // localStorageから情報を取得
        this.reviewerName = localStorage.getItem('current_reviewer');
        this.category = localStorage.getItem('current_category');
        this.quizPath = localStorage.getItem('current_quiz_path');

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

            // 進捗があればそこから開始、なければ0から
            const progress = await StorageManager.getProgress(this.reviewerName, this.category);
            if (progress && progress.questionIndex >= 0 && progress.questionIndex < this.questions.length) {
                // 進捗が見つかった場合、ユーザーに確認
                const nextQuestion = progress.questionIndex + 1;
                const confirmMessage = `前回の続きから始めますか？\n\n問題${nextQuestion}/${this.questions.length}から再開します。\n\n「OK」= 続きから開始\n「キャンセル」= 最初から開始`;

                const continueFromProgress = confirm(confirmMessage);

                if (continueFromProgress) {
                    this.currentIndex = progress.questionIndex;
                    console.log('進捗から再開:', this.currentIndex);
                } else {
                    this.currentIndex = 0;
                    console.log('最初から開始');
                }
            } else {
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

        // 進捗の更新
        document.getElementById('current-question').textContent = this.currentIndex + 1;
        const progress = ((this.currentIndex + 1) / this.questions.length) * 100;
        document.getElementById('progress-fill').style.width = `${progress}%`;

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
    submitAnswer() {
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

        // APIに送信（非同期、エラーでも処理は継続）
        const reviewData = {
            review_id: this.currentReviewId,
            question_id: question.questionID,
            question_set: this.category,
            question_index: this.currentIndex,
            keyword: question.keyword || '',
            category: question.category,
            question_text: question.question,
            reviewer_name: this.reviewerName,
            answer: selectedText,
            correct_answer: correctText,
            is_correct: isCorrect,
            timestamp: new Date().toISOString(),
            comment: ''
        };

        StorageManager.saveReviewToAPI(reviewData).catch(error => {
            console.warn('API送信に失敗しましたが、localStorageには保存されています:', error);
        });

        // 進捗を保存
        StorageManager.saveProgress(this.reviewerName, this.category, this.currentIndex);

        // 結果表示
        this.showResult(isCorrect, selectedText, correctText);

        // 選択肢に色をつける（アニメーション後に実行）
        setTimeout(() => {
            this.highlightChoices(this.correctAnswerIndex);
        }, 300);

        // ボタンの切り替え
        document.getElementById('submit-btn').style.display = 'none';

        if (this.currentIndex < this.questions.length - 1) {
            document.getElementById('next-btn').style.display = 'block';
        } else {
            document.getElementById('complete-btn').style.display = 'block';
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
        // コメントを保存
        if (this.currentReviewId) {
            const comment = document.getElementById('comment-input').value.trim();
            StorageManager.updateComment(this.currentReviewId, comment);

            // コメントが入力されていればAPIにも送信（コメント更新）
            if (comment) {
                const results = StorageManager.getAllResults();
                const reviewData = results.find(r => r.review_id === this.currentReviewId);
                if (reviewData) {
                    await StorageManager.saveReviewToAPI(reviewData).catch(error => {
                        console.warn('コメントの同期に失敗しました:', error);
                    });
                }
            }
        }

        if (this.currentIndex < this.questions.length - 1) {
            this.currentIndex++;
            // 進捗を保存
            StorageManager.saveProgress(this.reviewerName, this.category, this.currentIndex);
            this.showQuestion();
        }
    },

    /**
     * レビュー完了
     */
    async completeReview() {
        // コメントを保存
        if (this.currentReviewId) {
            const comment = document.getElementById('comment-input').value.trim();
            StorageManager.updateComment(this.currentReviewId, comment);

            // コメントが入力されていればAPIにも送信（コメント更新）
            if (comment) {
                const results = StorageManager.getAllResults();
                const reviewData = results.find(r => r.review_id === this.currentReviewId);
                if (reviewData) {
                    await StorageManager.saveReviewToAPI(reviewData).catch(error => {
                        console.warn('コメントの同期に失敗しました:', error);
                    });
                }
            }
        }

        // 進捗を削除（レビュー完了）
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
