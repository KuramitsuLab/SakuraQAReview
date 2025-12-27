/**
 * ストレージ管理モジュール
 * レビュー結果の保存、エクスポート、統計機能を提供
 */

const StorageManager = {
    STORAGE_KEY: 'review_results',
    PROGRESS_KEY: 'review_progress',
    s3: null, // S3クライアント（初期化後に設定）

    /**
     * レビュー結果を保存
     * @param {Object} result - レビュー結果
     */
    saveResult(result) {
        try {
            const results = this.getAllResults();

            // レビューIDを生成（タイムスタンプ + ランダム文字列）
            const reviewId = `review_${Date.now()}_${this.generateRandomString(8)}`;

            const reviewResult = {
                review_id: reviewId,
                question_id: result.questionId,
                question_set: result.questionSet,
                question_index: result.questionIndex,
                keyword: result.keyword || '',
                category: result.category,
                question_text: result.questionText,
                reviewer_name: result.reviewerName,
                answer: result.answer,              // 選択した選択肢のテキスト
                correct_answer: result.correctAnswer, // 正解の選択肢のテキスト
                is_correct: result.isCorrect,
                timestamp: new Date().toISOString(),
                comment: result.comment || ''
            };

            results.push(reviewResult);
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(results));

            console.log('レビュー結果を保存しました:', reviewId);
            return reviewId;
        } catch (error) {
            console.error('保存エラー:', error);
            throw new Error('レビュー結果の保存に失敗しました');
        }
    },

    /**
     * すべてのレビュー結果を取得
     * @returns {Array} レビュー結果の配列
     */
    getAllResults() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('読み込みエラー:', error);
            return [];
        }
    },

    /**
     * 特定のレビューのコメントを更新
     * @param {string} reviewId - レビューID
     * @param {string} comment - コメント
     */
    updateComment(reviewId, comment) {
        try {
            const results = this.getAllResults();
            const index = results.findIndex(r => r.review_id === reviewId);

            if (index !== -1) {
                results[index].comment = comment;
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(results));
                console.log('コメントを更新しました:', reviewId);
                return true;
            } else {
                console.warn('レビューIDが見つかりません:', reviewId);
                return false;
            }
        } catch (error) {
            console.error('コメント更新エラー:', error);
            return false;
        }
    },

    /**
     * 特定の条件でフィルタリング
     * @param {Object} filters - フィルター条件
     * @returns {Array} フィルタリングされた結果
     */
    filterResults(filters = {}) {
        const results = this.getAllResults();
        let filtered = [...results];

        if (filters.reviewerName) {
            filtered = filtered.filter(r => r.reviewer_name === filters.reviewerName);
        }

        if (filters.category) {
            filtered = filtered.filter(r => r.category === filters.category);
        }

        if (filters.questionSet) {
            filtered = filtered.filter(r => r.question_set === filters.questionSet);
        }

        if (filters.isCorrect !== undefined) {
            filtered = filtered.filter(r => r.is_correct === filters.isCorrect);
        }

        return filtered;
    },

    /**
     * 統計情報を取得
     * @returns {Object} 統計情報
     */
    getStatistics() {
        const results = this.getAllResults();

        if (results.length === 0) {
            return {
                total: 0,
                correct: 0,
                incorrect: 0,
                accuracy: 0,
                byCategory: {},
                byReviewer: {},
                byQuestionSet: {}
            };
        }

        const correct = results.filter(r => r.is_correct).length;
        const incorrect = results.length - correct;
        const accuracy = (correct / results.length * 100).toFixed(2);

        // カテゴリ別
        const byCategory = {};
        results.forEach(r => {
            if (!byCategory[r.category]) {
                byCategory[r.category] = { total: 0, correct: 0, incorrect: 0 };
            }
            byCategory[r.category].total++;
            if (r.is_correct) {
                byCategory[r.category].correct++;
            } else {
                byCategory[r.category].incorrect++;
            }
        });

        // カテゴリ別の正解率を計算
        Object.keys(byCategory).forEach(cat => {
            byCategory[cat].accuracy = (byCategory[cat].correct / byCategory[cat].total * 100).toFixed(2);
        });

        // レビューア別
        const byReviewer = {};
        results.forEach(r => {
            if (!byReviewer[r.reviewer_name]) {
                byReviewer[r.reviewer_name] = { total: 0, correct: 0, incorrect: 0 };
            }
            byReviewer[r.reviewer_name].total++;
            if (r.is_correct) {
                byReviewer[r.reviewer_name].correct++;
            } else {
                byReviewer[r.reviewer_name].incorrect++;
            }
        });

        // レビューア別の正解率を計算
        Object.keys(byReviewer).forEach(reviewer => {
            byReviewer[reviewer].accuracy = (byReviewer[reviewer].correct / byReviewer[reviewer].total * 100).toFixed(2);
        });

        // 問題セット別
        const byQuestionSet = {};
        results.forEach(r => {
            if (!byQuestionSet[r.question_set]) {
                byQuestionSet[r.question_set] = { total: 0, correct: 0, incorrect: 0 };
            }
            byQuestionSet[r.question_set].total++;
            if (r.is_correct) {
                byQuestionSet[r.question_set].correct++;
            } else {
                byQuestionSet[r.question_set].incorrect++;
            }
        });

        // 問題セット別の正解率を計算
        Object.keys(byQuestionSet).forEach(set => {
            byQuestionSet[set].accuracy = (byQuestionSet[set].correct / byQuestionSet[set].total * 100).toFixed(2);
        });

        return {
            total: results.length,
            correct,
            incorrect,
            accuracy: parseFloat(accuracy),
            byCategory,
            byReviewer,
            byQuestionSet
        };
    },

    /**
     * JSON形式でエクスポート
     */
    exportToJSON() {
        const results = this.getAllResults();
        const dataStr = JSON.stringify(results, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const filename = `review_results_${this.getTimestamp()}.json`;

        this.downloadFile(blob, filename);
        console.log('JSONファイルをエクスポートしました:', filename);
    },

    /**
     * CSV形式でエクスポート（Excel対応、BOM付きUTF-8）
     */
    exportToCSV() {
        const results = this.getAllResults();

        if (results.length === 0) {
            alert('エクスポートするデータがありません');
            return;
        }

        // CSVヘッダー
        const headers = [
            'レビューID',
            '問題ID',
            '問題セット',
            '問題インデックス',
            'キーワード',
            'カテゴリ',
            '問題文',
            'レビューア名',
            '回答',
            '正解',
            '正誤',
            'タイムスタンプ',
            'コメント'
        ];

        // CSVデータ
        const rows = results.map(r => [
            r.review_id,
            r.question_id,
            r.question_set,
            r.question_index,
            r.keyword,
            r.category,
            `"${r.question_text.replace(/"/g, '""')}"`,
            r.reviewer_name,
            `"${r.answer.replace(/"/g, '""')}"`,
            `"${r.correct_answer.replace(/"/g, '""')}"`,
            r.is_correct ? '正解' : '不正解',
            r.timestamp,
            r.comment ? `"${r.comment.replace(/"/g, '""')}"` : ''
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\r\n');

        // BOM付きUTF-8でエンコード（Excel対応）
        const bom = '\uFEFF';
        const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
        const filename = `review_results_${this.getTimestamp()}.csv`;

        this.downloadFile(blob, filename);
        console.log('CSVファイルをエクスポートしました:', filename);
    },

    /**
     * すべてのデータを削除
     * @param {boolean} confirm - 確認ダイアログをスキップ
     */
    clearAll(confirm = true) {
        if (confirm) {
            const userConfirm = window.confirm('すべてのレビュー結果を削除してもよろしいですか？この操作は取り消せません。');
            if (!userConfirm) {
                return false;
            }
        }

        localStorage.removeItem(this.STORAGE_KEY);
        console.log('すべてのデータを削除しました');
        return true;
    },

    /**
     * ファイルダウンロード
     * @param {Blob} blob - ファイルデータ
     * @param {string} filename - ファイル名
     */
    downloadFile(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /**
     * タイムスタンプ文字列を生成
     * @returns {string} YYYYMMDD_HHMMSS形式
     */
    getTimestamp() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        return `${year}${month}${day}_${hours}${minutes}${seconds}`;
    },

    /**
     * ランダム文字列を生成
     * @param {number} length - 文字列の長さ
     * @returns {string} ランダム文字列
     */
    generateRandomString(length) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    },

    /**
     * 進捗を保存
     * @param {string} reviewerName - レビュアー名
     * @param {string} category - カテゴリ
     * @param {number} questionIndex - 現在の問題インデックス
     */
    saveProgress(reviewerName, category, questionIndex) {
        try {
            const progressData = this.getAllProgress();
            const key = `${reviewerName}__${category}`;
            progressData[key] = {
                reviewerName,
                category,
                questionIndex,
                timestamp: new Date().toISOString()
            };
            localStorage.setItem(this.PROGRESS_KEY, JSON.stringify(progressData));
            console.log('進捗を保存しました:', key, questionIndex);
        } catch (error) {
            console.error('進捗保存エラー:', error);
        }
    },

    /**
     * 進捗を取得
     * @param {string} reviewerName - レビュアー名
     * @param {string} category - カテゴリ
     * @returns {Object|null} 進捗データ（なければnull）
     */
    getProgress(reviewerName, category) {
        try {
            const progressData = this.getAllProgress();
            const key = `${reviewerName}__${category}`;
            return progressData[key] || null;
        } catch (error) {
            console.error('進捗取得エラー:', error);
            return null;
        }
    },

    /**
     * すべての進捗を取得
     * @returns {Object} 進捗データのオブジェクト
     */
    getAllProgress() {
        try {
            const data = localStorage.getItem(this.PROGRESS_KEY);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('進捗読み込みエラー:', error);
            return {};
        }
    },

    /**
     * 進捗を削除
     * @param {string} reviewerName - レビュアー名
     * @param {string} category - カテゴリ
     */
    clearProgress(reviewerName, category) {
        try {
            const progressData = this.getAllProgress();
            const key = `${reviewerName}__${category}`;
            delete progressData[key];
            localStorage.setItem(this.PROGRESS_KEY, JSON.stringify(progressData));
            console.log('進捗を削除しました:', key);
        } catch (error) {
            console.error('進捗削除エラー:', error);
        }
    },

    /**
     * レビュー結果をAPIに送信（1問ごと）
     * @param {Object} reviewData - レビューデータ
     * @returns {Promise<boolean>} 成功したかどうか
     */
    async saveReviewToAPI(reviewData) {
        // AWS_CONFIGが定義されていない、またはS3アップロードが無効の場合
        if (typeof AWS_CONFIG === 'undefined' || !AWS_CONFIG.enableS3Upload) {
            console.log('API保存機能は無効です（localStorageのみ使用）');
            return false;
        }

        // APIエンドポイントが設定されているか確認
        if (!AWS_CONFIG.apiEndpoint) {
            console.warn('APIエンドポイントが設定されていません');
            return false;
        }

        try {
            const response = await fetch(AWS_CONFIG.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(reviewData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log('APIに保存成功:', result);
            return true;

        } catch (error) {
            console.error('API保存エラー:', error);
            // エラーでもlocalStorageには保存されているので、falseを返すだけ
            return false;
        }
    }
};

// グローバルに公開
window.StorageManager = StorageManager;
