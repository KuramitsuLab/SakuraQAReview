/**
 * 分析機能
 * レビュー結果を集計・可視化
 */

const Analytics = {
    questions: [],
    reviews: [],
    charts: {},

    /**
     * 初期化
     */
    async init() {
        try {
            await this.loadData();
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
     * レビュー結果を読み込み（S3 or localStorage）
     */
    async loadReviews() {
        // まずS3から取得を試みる
        if (window.AWS_CONFIG && window.AWS_CONFIG.s3BucketName) {
            try {
                const reviews = await this.loadFromS3();
                if (reviews.length > 0) {
                    return reviews;
                }
            } catch (error) {
                console.warn('S3からの読み込みに失敗しました:', error);
            }
        }

        // localStorageから取得
        return StorageManager.getAllResults();
    },

    /**
     * S3からレビュー結果を取得
     */
    async loadFromS3() {
        if (!window.AWS || !window.AWS_CONFIG) {
            throw new Error('AWS設定が見つかりません');
        }

        const s3 = new AWS.S3({
            accessKeyId: AWS_CONFIG.accessKeyId,
            secretAccessKey: AWS_CONFIG.secretAccessKey,
            region: AWS_CONFIG.region
        });

        // S3バケット内のすべてのオブジェクトを取得
        const params = {
            Bucket: AWS_CONFIG.s3BucketName,
            Prefix: AWS_CONFIG.s3KeyPrefix || ''
        };

        const data = await s3.listObjectsV2(params).promise();
        const reviews = [];

        // 各オブジェクトを取得してパース
        for (const obj of data.Contents || []) {
            if (obj.Key.endsWith('.json')) {
                const getParams = {
                    Bucket: AWS_CONFIG.s3BucketName,
                    Key: obj.Key
                };

                try {
                    const objData = await s3.getObject(getParams).promise();
                    const review = JSON.parse(objData.Body.toString('utf-8'));
                    reviews.push(review);
                } catch (error) {
                    console.warn(`ファイル ${obj.Key} の読み込みに失敗:`, error);
                }
            }
        }

        return reviews;
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
        this.reviews = this.reviews.filter(review => {
            const questionId = review.question_id || review.questionId;
            return questionMap.has(questionId);
        });

        console.log(`フィルタリング後のレビュー数: ${this.reviews.length}件`);

        // レビュー結果と問題データを結合
        this.enrichedReviews = this.reviews.map(review => {
            const question = questionMap.get(review.question_id || review.questionId);
            return {
                ...review,
                question: question || {}
            };
        });

        // 全体統計
        this.overallStats = this.calculateOverallStats();

        // authored_by別統計
        this.authorStats = this.calculateByAuthor();

        // reviewer別統計
        this.reviewerStats = this.calculateByReviewer();

        // 問題別統計
        this.questionStats = this.calculateByQuestion();
    },

    /**
     * 全体統計を計算
     */
    calculateOverallStats() {
        const correct = this.reviews.filter(r => r.is_correct || r.isCorrect).length;
        const total = this.questions.length; // 総問題数はquestions.jsonの問題数
        const accuracy = total > 0 ? ((correct / total) * 100).toFixed(1) : 0;

        return { correct, total, accuracy };
    },

    /**
     * authored_by別統計を計算
     */
    calculateByAuthor() {
        const stats = {};

        this.enrichedReviews.forEach(review => {
            const author = review.question.authored_by;

            // Unknownまたはauthored_byがない場合はスキップ
            if (!author || author === 'Unknown') {
                return;
            }

            if (!stats[author]) {
                stats[author] = { correct: 0, total: 0 };
            }

            stats[author].total++;
            if (review.is_correct || review.isCorrect) {
                stats[author].correct++;
            }
        });

        // 正答率を計算
        Object.keys(stats).forEach(author => {
            const s = stats[author];
            s.accuracy = s.total > 0 ? ((s.correct / s.total) * 100).toFixed(1) : 0;
        });

        return stats;
    },

    /**
     * reviewer別統計を計算
     */
    calculateByReviewer() {
        const stats = {};

        this.reviews.forEach(review => {
            const reviewer = review.reviewer_name || review.reviewerName || 'Unknown';

            if (!stats[reviewer]) {
                stats[reviewer] = { correct: 0, total: 0 };
            }

            stats[reviewer].total++;
            if (review.is_correct || review.isCorrect) {
                stats[reviewer].correct++;
            }
        });

        // 正答率を計算
        Object.keys(stats).forEach(reviewer => {
            const s = stats[reviewer];
            s.accuracy = s.total > 0 ? ((s.correct / s.total) * 100).toFixed(1) : 0;
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
        document.getElementById('overall-correct').textContent = this.overallStats.correct;
        document.getElementById('overall-total').textContent = this.overallStats.total;
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
                <td>${stats.correct}</td>
                <td>${stats.total}</td>
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
        // すべてのレビュアーのリストを取得
        const reviewers = [...new Set(this.reviews.map(r => r.reviewer_name || r.reviewerName))];
        reviewers.sort(); // アルファベット順にソート

        // 問題データをマップ化
        const questionMap = new Map();
        this.questions.forEach(q => {
            questionMap.set(q.questionID, q);
        });

        // レビュー結果をquestion_id × reviewer でグループ化
        const reviewsByQuestion = new Map();
        this.reviews.forEach(review => {
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
