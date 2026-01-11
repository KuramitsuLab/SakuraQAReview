/**
 * 分析機能
 * レビュー結果を集計・可視化
 */

const Analytics = {
    questions: [],
    reviews: [],
    charts: {},
    allReviewers: [],           // すべてのレビュアー名
    selectedReviewers: new Set(), // 選択されたレビュアー名

    /**
     * 初期化
     */
    async init() {
        try {
            await this.loadData();
            this.initializeReviewerFilter();
            this.renderReviewerFilter();
            this.analyzeData();
            this.renderAll();
            this.setupDownloads();
        } catch (error) {
            this.showError(error.message);
        }
    },

    /**
     * データを読み込み
     */
    async loadData() {
        // 問題データを読み込み
        console.log('問題データを読み込んでいます...');
        this.questions = await GitHubLoader.fetch('quiz/questions.json');

        // レビュー結果を読み込み（S3またはlocalStorage）
        console.log('レビュー結果を読み込んでいます...');
        this.reviews = await this.loadReviews();

        console.log(`問題データ: ${this.questions.length}問`);
        console.log(`レビュー結果: ${this.reviews.length}件`);

        if (this.reviews.length === 0) {
            throw new Error('レビューデータが見つかりませんでした。先に問題をレビューしてください。');
        }
    },

    /**
     * レビュー結果を読み込み（API or localStorage）
     */
    async loadReviews() {
        // まずAPIから取得を試みる
        if (window.AWS_CONFIG && window.AWS_CONFIG.apiEndpoint) {
            try {
                const reviews = await this.loadFromAPI();
                if (reviews.length > 0) {
                    console.log(`APIから${reviews.length}件のレビュー結果を取得しました`);
                    return reviews;
                }
            } catch (error) {
                console.warn('APIからの読み込みに失敗しました:', error);
            }
        }

        // APIから取得できない場合はlocalStorageから取得
        console.log('localStorageからレビュー結果を取得します');
        return StorageManager.getAllResults();
    },

    /**
     * APIからレビュー結果を取得
     */
    async loadFromAPI() {
        if (!window.AWS_CONFIG || !window.AWS_CONFIG.apiEndpoint) {
            throw new Error('API設定が見つかりません');
        }

        try {
            const response = await fetch(AWS_CONFIG.apiEndpoint, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.success && Array.isArray(data.reviews)) {
                return data.reviews;
            } else {
                throw new Error('APIレスポンスの形式が不正です');
            }

        } catch (error) {
            console.error('API取得エラー:', error);
            throw error;
        }
    },

    /**
     * データを分析
     */
    analyzeData() {
        // 問題データをマップ化（高速検索用）
        const questionMap = new Map();
        this.questions.forEach(q => {
            questionMap.set(q.questionID, q);
        });

        // レビュー結果をquestions.jsonに存在する問題のみに絞る
        let filteredReviews = this.reviews.filter(review => {
            const questionId = review.question_id || review.questionId;
            return questionMap.has(questionId);
        });

        // 選択されたレビュアーでフィルタリング
        filteredReviews = filteredReviews.filter(review => {
            const reviewerName = review.reviewer_name || review.reviewerName || 'Unknown';
            return this.selectedReviewers.has(reviewerName);
        });

        console.log(`フィルタリング後のレビュー数: ${filteredReviews.length}件`);

        // レビュー結果と問題データを結合
        this.enrichedReviews = filteredReviews.map(review => {
            const question = questionMap.get(review.question_id || review.questionId);
            return {
                ...review,
                question: question || {}
            };
        });

        // authored_by別統計
        this.authorStats = this.calculateByAuthor();

        // reviewer別統計
        this.reviewerStats = this.calculateByReviewer();

        // 問題別統計
        this.questionStats = this.calculateByQuestion();

        // 全体統計（レビュアー別統計の後に計算）
        this.overallStats = this.calculateOverallStats();
    },

    /**
     * レビュアーフィルターを初期化
     */
    initializeReviewerFilter() {
        // すべてのユニークなレビュアー名を取得
        const reviewerSet = new Set();
        this.reviews.forEach(review => {
            const reviewerName = review.reviewer_name || review.reviewerName || 'Unknown';
            reviewerSet.add(reviewerName);
        });

        // アルファベット順にソート
        this.allReviewers = Array.from(reviewerSet).sort();

        // デフォルトではすべてのレビュアーを選択
        this.selectedReviewers = new Set(this.allReviewers);
    },

    /**
     * レビュアーフィルターUIを描画
     */
    renderReviewerFilter() {
        const container = document.getElementById('reviewerFilterGrid');
        container.innerHTML = '';

        // 総問題数を取得
        const totalQuestions = this.questions.length;

        this.allReviewers.forEach(reviewer => {
            // このレビュアーのS3に保存されている回答数を取得（ユニークな問題インデックスのみ）
            const reviewerAnswers = this.reviews.filter(r =>
                (r.reviewer_name || r.reviewerName) === reviewer
            );
            const uniqueQuestionIndexes = new Set(
                reviewerAnswers.map(r => r.question_index !== undefined ? r.question_index : r.questionIndex)
            );
            const savedCount = uniqueQuestionIndexes.size;

            // localStorageから進捗を取得して、240問目まで到達しているかチェック
            const progressData = StorageManager.getAllProgress();
            const progressKey = Object.keys(progressData).find(key => key.startsWith(`${reviewer}__`));
            const progress = progressKey ? progressData[progressKey] : null;
            const hasReachedEnd = progress && progress.questionIndex >= totalQuestions - 1;

            // 未保存問題数を計算
            const missingCount = hasReachedEnd ? totalQuestions - savedCount : 0;
            const isCompleted = savedCount >= totalQuestions;
            const hasUnfinished = hasReachedEnd && missingCount > 0;

            const checkboxDiv = document.createElement('div');
            checkboxDiv.className = 'reviewer-checkbox';

            // 全問解いている場合は特別なクラスを追加
            if (isCompleted) {
                checkboxDiv.classList.add('completed');
            } else if (hasUnfinished) {
                checkboxDiv.classList.add('incomplete');
            }

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `reviewer-${reviewer}`;
            checkbox.value = reviewer;
            checkbox.checked = this.selectedReviewers.has(reviewer);
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.selectedReviewers.add(reviewer);
                } else {
                    this.selectedReviewers.delete(reviewer);
                }
                this.refreshAnalysis();
            });

            const label = document.createElement('label');
            label.htmlFor = `reviewer-${reviewer}`;
            label.textContent = reviewer;

            // バッジを追加
            if (hasUnfinished) {
                // 240問目まで到達しているが、途中が抜けている場合
                const badge = document.createElement('span');
                badge.className = 'completion-badge warning-badge';
                badge.textContent = `⚠️ ${missingCount}問未保存`;
                label.appendChild(badge);
            } else if (isCompleted) {
                // 完全に完了している場合
                const badge = document.createElement('span');
                badge.className = 'completion-badge';
                badge.textContent = '✓ 完了';
                label.appendChild(badge);
            }

            checkboxDiv.appendChild(checkbox);
            checkboxDiv.appendChild(label);
            container.appendChild(checkboxDiv);
        });

        // ボタンのイベントリスナー
        document.getElementById('selectAllReviewersBtn').addEventListener('click', () => {
            this.selectAllReviewers();
        });

        document.getElementById('deselectAllReviewersBtn').addEventListener('click', () => {
            this.deselectAllReviewers();
        });
    },

    /**
     * すべてのレビュアーを選択
     */
    selectAllReviewers() {
        this.selectedReviewers = new Set(this.allReviewers);
        this.allReviewers.forEach(reviewer => {
            const checkbox = document.getElementById(`reviewer-${reviewer}`);
            if (checkbox) checkbox.checked = true;
        });
        this.refreshAnalysis();
    },

    /**
     * すべてのレビュアーを解除
     */
    deselectAllReviewers() {
        this.selectedReviewers.clear();
        this.allReviewers.forEach(reviewer => {
            const checkbox = document.getElementById(`reviewer-${reviewer}`);
            if (checkbox) checkbox.checked = false;
        });
        this.refreshAnalysis();
    },

    /**
     * 分析を再実行
     */
    refreshAnalysis() {
        this.analyzeData();
        this.renderAll();
    },

    /**
     * 全体統計を計算（レビュアーの平均正答率）
     */
    calculateOverallStats() {
        // レビュアー別の正答率の平均を計算
        const reviewers = Object.keys(this.reviewerStats);

        if (reviewers.length === 0) {
            return { accuracy: 0, reviewerCount: 0 };
        }

        // 各レビュアーの正答率を合計
        const totalAccuracy = reviewers.reduce((sum, reviewer) => {
            return sum + parseFloat(this.reviewerStats[reviewer].accuracy);
        }, 0);

        // 平均正答率を計算
        const accuracy = (totalAccuracy / reviewers.length).toFixed(1);

        return {
            accuracy: accuracy,
            reviewerCount: reviewers.length
        };
    },

    /**
     * authored_by別統計を計算（レビュアーの平均正答率）
     */
    calculateByAuthor() {
        // 作成者×レビュアーごとにグループ化
        const authorReviewerStats = {};
        // 作成者ごとの問題数をカウント
        const authorQuestionCounts = {};

        this.enrichedReviews.forEach(review => {
            const author = review.question.authored_by;
            const reviewer = review.reviewer_name || review.reviewerName || 'Unknown';

            // Unknownまたはauthored_byがない場合はスキップ
            if (!author || author === 'Unknown') {
                return;
            }

            if (!authorReviewerStats[author]) {
                authorReviewerStats[author] = {};
            }

            if (!authorReviewerStats[author][reviewer]) {
                authorReviewerStats[author][reviewer] = {
                    correct: 0,
                    total: 0
                };
            }

            authorReviewerStats[author][reviewer].total++;
            if (review.is_correct || review.isCorrect) {
                authorReviewerStats[author][reviewer].correct++;
            }
        });

        // 作成者ごとの問題数をカウント（questions.jsonから）
        this.questions.forEach(q => {
            const author = q.authored_by;
            if (author && author !== 'Unknown') {
                authorQuestionCounts[author] = (authorQuestionCounts[author] || 0) + 1;
            }
        });

        // 各作成者について、レビュアーごとの正答率の平均を計算
        const stats = {};

        Object.keys(authorReviewerStats).forEach(author => {
            const reviewerStats = authorReviewerStats[author];
            const reviewers = Object.keys(reviewerStats);

            if (reviewers.length === 0) {
                return;
            }

            // 各レビュアーの正答率を計算
            const accuracies = reviewers.map(reviewer => {
                const s = reviewerStats[reviewer];
                return s.total > 0 ? (s.correct / s.total) * 100 : 0;
            });

            // 平均正答率を計算
            const avgAccuracy = accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length;

            stats[author] = {
                questionCount: authorQuestionCounts[author] || 0,
                accuracy: avgAccuracy.toFixed(1),
                reviewerCount: reviewers.length
            };
        });

        return stats;
    },

    /**
     * reviewer別統計を計算
     */
    calculateByReviewer() {
        const stats = {};

        this.enrichedReviews.forEach(review => {
            const reviewer = review.reviewer_name || review.reviewerName || 'Unknown';
            const questionId = review.question_id || review.questionId;

            if (!stats[reviewer]) {
                stats[reviewer] = {
                    correct: 0,
                    total: 0,
                    uniqueQuestions: new Set(),
                    correctQuestions: new Set()
                };
            }

            // ユニークな問題のみカウント（最初の回答のみ）
            if (!stats[reviewer].uniqueQuestions.has(questionId)) {
                stats[reviewer].uniqueQuestions.add(questionId);
                stats[reviewer].total++;

                if (review.is_correct || review.isCorrect) {
                    stats[reviewer].correctQuestions.add(questionId);
                    stats[reviewer].correct++;
                }
            }
        });

        // 正答率を計算（Setは削除）
        Object.keys(stats).forEach(reviewer => {
            const s = stats[reviewer];
            s.accuracy = s.total > 0 ? ((s.correct / s.total) * 100).toFixed(1) : 0;
            // Setオブジェクトは削除（返却時には不要）
            delete s.uniqueQuestions;
            delete s.correctQuestions;
        });

        return stats;
    },

    /**
     * 問題別統計を計算
     */
    calculateByQuestion() {
        const stats = {};

        this.enrichedReviews.forEach(review => {
            const questionId = review.question_id || review.questionId;

            if (!stats[questionId]) {
                stats[questionId] = {
                    questionId,
                    question: review.question,
                    correct: 0,
                    total: 0
                };
            }

            stats[questionId].total++;
            if (review.is_correct || review.isCorrect) {
                stats[questionId].correct++;
            }
        });

        // 正答率を計算してソート
        const statsList = Object.values(stats);
        statsList.forEach(s => {
            s.accuracy = s.total > 0 ? ((s.correct / s.total) * 100).toFixed(1) : 0;
        });

        // 正答率の低い順（難しい問題順）にソート
        statsList.sort((a, b) => parseFloat(a.accuracy) - parseFloat(b.accuracy));

        return statsList;
    },

    /**
     * すべてのセクションを描画
     */
    renderAll() {
        document.getElementById('loading').style.display = 'none';

        this.renderOverallStats();
        this.renderAuthorStats();
        this.renderReviewerStats();
        this.renderQuestionStats();

        // すべてのセクションを表示
        document.getElementById('overall-stats').style.display = 'block';
        document.getElementById('reviewer-filter-section').style.display = 'block';
        document.getElementById('by-author-section').style.display = 'block';
        document.getElementById('by-reviewer-section').style.display = 'block';
        document.getElementById('by-question-section').style.display = 'block';
        document.getElementById('download-section').style.display = 'block';
    },

    /**
     * 全体統計を描画
     */
    renderOverallStats() {
        document.getElementById('overall-accuracy').textContent = `${this.overallStats.accuracy}%`;
    },

    /**
     * authored_by別統計を描画
     */
    renderAuthorStats() {
        // テーブルを描画
        const tbody = document.getElementById('authorTableBody');
        tbody.innerHTML = '';

        Object.entries(this.authorStats).forEach(([author, stats]) => {
            const row = tbody.insertRow();
            row.innerHTML = `
                <td>${author}</td>
                <td>${stats.questionCount}</td>
                <td>
                    ${stats.accuracy}%
                    <div class="accuracy-bar" style="width: ${stats.accuracy}px"></div>
                </td>
            `;
        });

        // グラフを描画
        this.renderBarChart('authorChart', this.authorStats, '問題作成者別正答率');
    },

    /**
     * reviewer別統計を描画
     */
    renderReviewerStats() {
        // テーブルを描画
        const tbody = document.getElementById('reviewerTableBody');
        tbody.innerHTML = '';

        Object.entries(this.reviewerStats).forEach(([reviewer, stats]) => {
            const row = tbody.insertRow();
            row.innerHTML = `
                <td>${reviewer}</td>
                <td>${stats.correct}</td>
                <td>${stats.total}</td>
                <td>
                    ${stats.accuracy}%
                    <div class="accuracy-bar" style="width: ${stats.accuracy}px"></div>
                </td>
            `;
        });

        // グラフを描画
        this.renderBarChart('reviewerChart', this.reviewerStats, 'レビュアー別正答率');
    },

    /**
     * 問題別統計を描画
     */
    renderQuestionStats() {
        const tbody = document.getElementById('questionTableBody');
        tbody.innerHTML = '';

        this.questionStats.forEach(stats => {
            const row = tbody.insertRow();
            const questionText = stats.question.question || '不明';
            const shortText = questionText.length > 50
                ? questionText.substring(0, 50) + '...'
                : questionText;

            row.innerHTML = `
                <td>${stats.questionId}</td>
                <td title="${questionText}">${shortText}</td>
                <td>${stats.question.authored_by || 'Unknown'}</td>
                <td>${stats.correct}</td>
                <td>${stats.total}</td>
                <td>
                    ${stats.accuracy}%
                    <div class="accuracy-bar" style="width: ${stats.accuracy}px"></div>
                </td>
            `;
        });
    },

    /**
     * 棒グラフを描画
     */
    renderBarChart(canvasId, stats, title) {
        const ctx = document.getElementById(canvasId);

        // 既存のグラフを破棄
        if (this.charts[canvasId]) {
            this.charts[canvasId].destroy();
        }

        const labels = Object.keys(stats);
        const data = labels.map(key => parseFloat(stats[key].accuracy));

        this.charts[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: '正答率 (%)',
                    data: data,
                    backgroundColor: 'rgba(255, 107, 157, 0.6)',
                    borderColor: 'rgba(255, 107, 157, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: title,
                        font: { size: 16 }
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                }
            }
        });
    },

    /**
     * ダウンロード機能を設定
     */
    setupDownloads() {
        document.getElementById('downloadAllBtn').addEventListener('click', () => {
            this.downloadJSONL();
        });

        document.getElementById('downloadQuestionCSVBtn').addEventListener('click', () => {
            this.downloadQuestionCSV();
        });
    },

    /**
     * 全データをJSONL形式でダウンロード
     */
    downloadJSONL() {
        const lines = this.enrichedReviews.map(review => JSON.stringify(review));
        const content = lines.join('\n');
        const blob = new Blob([content], { type: 'application/x-jsonlines' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sakuraqa-reviews-${new Date().toISOString().split('T')[0]}.jsonl`;
        a.click();
        URL.revokeObjectURL(url);
    },

    /**
     * 問題別集計をWide形式のCSVでダウンロード
     */
    downloadQuestionCSV() {
        // 選択されたレビュアーのリストを使用
        const reviewers = Array.from(this.selectedReviewers).sort();

        // 問題データをマップ化
        const questionMap = new Map();
        this.questions.forEach(q => {
            questionMap.set(q.questionID, q);
        });

        // レビュー結果をquestion_id × reviewer でグループ化（フィルタ済みのレビューを使用）
        const reviewsByQuestion = new Map();
        this.enrichedReviews.forEach(review => {
            const questionId = review.question_id || review.questionId;
            const reviewer = review.reviewer_name || review.reviewerName;

            if (!reviewsByQuestion.has(questionId)) {
                reviewsByQuestion.set(questionId, {});
            }

            reviewsByQuestion.get(questionId)[reviewer] = {
                answer: review.answer,
                is_correct: review.is_correct || review.isCorrect
            };
        });

        // CSVヘッダーを生成
        const headers = [
            'question_id',
            'question',
            'category',
            'authored_by',
            'choice_1',
            'choice_2',
            'choice_3',
            'choice_4',
            'correct_answer'
        ];

        // レビュアー別の列を追加
        reviewers.forEach(reviewer => {
            headers.push(`${reviewer}_answer`);
            headers.push(`${reviewer}_is_correct`);
        });

        // CSV行を生成
        const rows = [headers];

        // すべての問題について行を生成
        this.questions.forEach(question => {
            const row = [
                this.escapeCSV(question.questionID),
                this.escapeCSV(question.question),
                this.escapeCSV(question.category),
                this.escapeCSV(question.authored_by),
                this.escapeCSV(question.choice[0] || ''),
                this.escapeCSV(question.choice[1] || ''),
                this.escapeCSV(question.choice[2] || ''),
                this.escapeCSV(question.choice[3] || ''),
                this.escapeCSV(question.answer)
            ];

            // 各レビュアーの回答を追加
            const questionReviews = reviewsByQuestion.get(question.questionID) || {};
            reviewers.forEach(reviewer => {
                const review = questionReviews[reviewer];
                if (review) {
                    row.push(this.escapeCSV(review.answer));
                    row.push(review.is_correct ? 'true' : 'false');
                } else {
                    row.push('null');
                    row.push('null');
                }
            });

            rows.push(row);
        });

        // CSVに変換
        const csv = rows.map(row => row.join(',')).join('\n');

        // ダウンロード
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sakuraqa-questions-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    },

    /**
     * CSVフィールドのエスケープ
     */
    escapeCSV(value) {
        if (value === null || value === undefined) {
            return 'null';
        }

        const str = String(value);

        // カンマ、改行、ダブルクォートが含まれる場合はダブルクォートで囲む
        if (str.includes(',') || str.includes('\n') || str.includes('"')) {
            // ダブルクォートを2つにエスケープ
            return `"${str.replace(/"/g, '""')}"`;
        }

        return str;
    },

    /**
     * エラーを表示
     */
    showError(message) {
        document.getElementById('loading').style.display = 'none';
        const container = document.getElementById('error-container');
        container.innerHTML = `
            <div class="error-message">
                <strong>エラー:</strong> ${message}
            </div>
        `;
        container.style.display = 'block';
    }
};

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', () => {
    Analytics.init();
});
