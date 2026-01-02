/**
 * Lambda関数: レビュー結果をS3のreview.jsonに追記
 *
 * API Gateway経由で呼び出され、1問回答するごとにレビューデータを追加します
 */

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-northeast-1' });
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'sakuraqa-review-results';
const FILE_KEY = 'review.json';

export const handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));

    // CORSヘッダー
    const headers = {
        'Access-Control-Allow-Origin': '*', // 本番環境では特定のオリジンに制限してください
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Content-Type': 'application/json'
    };

    // OPTIONSリクエスト（プリフライト）への対応
    if (event.httpMethod === 'OPTIONS' || event.requestContext?.http?.method === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: 'CORS preflight successful' })
        };
    }

    // GETリクエスト: レビュー結果を取得
    if (event.httpMethod === 'GET' || event.requestContext?.http?.method === 'GET') {
        return await handleGetReviews(headers);
    }

    // POSTリクエスト: レビュー結果を保存
    return await handlePostReview(event, headers);
};

/**
 * GETリクエスト処理: レビュー結果を取得
 */
async function handleGetReviews(headers) {
    try {
        // S3からreview.jsonを取得
        const getCommand = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: FILE_KEY
        });

        const response = await s3Client.send(getCommand);
        const bodyContents = await streamToString(response.Body);
        const reviews = JSON.parse(bodyContents);

        console.log(`Retrieved ${reviews.length} reviews`);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                reviews: reviews,
                total: reviews.length
            })
        };

    } catch (error) {
        if (error.name === 'NoSuchKey') {
            // ファイルが存在しない場合は空配列を返す
            console.log('review.json does not exist yet, returning empty array');
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    reviews: [],
                    total: 0
                })
            };
        }

        console.error('Error retrieving reviews:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message
            })
        };
    }
}

/**
 * POSTリクエスト処理: レビュー結果を保存
 */
async function handlePostReview(event, headers) {

    try {
        // リクエストボディの解析
        const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;

        // 必須フィールドの検証
        const requiredFields = [
            'review_id', 'question_id', 'question_set', 'question_index',
            'category', 'question_text', 'reviewer_name', 'answer',
            'correct_answer', 'is_correct', 'timestamp'
        ];

        for (const field of requiredFields) {
            if (body[field] === undefined) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        error: 'Validation error',
                        message: `Missing required field: ${field}`
                    })
                };
            }
        }

        // レビューデータの構造化
        const reviewData = {
            review_id: body.review_id,
            question_id: body.question_id,
            question_set: body.question_set,
            question_index: body.question_index,
            keyword: body.keyword || '',
            category: body.category,
            question_text: body.question_text,
            reviewer_name: body.reviewer_name,
            answer: body.answer,
            correct_answer: body.correct_answer,
            is_correct: body.is_correct,
            timestamp: body.timestamp,
            comment: body.comment || ''
        };

        // S3から既存のreview.jsonを取得
        let existingReviews = [];
        try {
            const getCommand = new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: FILE_KEY
            });

            const response = await s3Client.send(getCommand);
            const bodyContents = await streamToString(response.Body);
            existingReviews = JSON.parse(bodyContents);

            console.log(`Loaded ${existingReviews.length} existing reviews`);
        } catch (error) {
            if (error.name === 'NoSuchKey') {
                console.log('review.json does not exist yet, creating new file');
                existingReviews = [];
            } else {
                throw error;
            }
        }

        // 既存のレビューを検索（同じreview_idがあれば更新、なければ追加）
        const existingIndex = existingReviews.findIndex(r => r.review_id === reviewData.review_id);

        if (existingIndex !== -1) {
            // 既存のレビューを更新（コメント更新など）
            existingReviews[existingIndex] = reviewData;
            console.log(`Updated existing review: ${reviewData.review_id}`);
        } else {
            // 新しいレビューを追加
            existingReviews.push(reviewData);
            console.log(`Added new review: ${reviewData.review_id}. Total count: ${existingReviews.length}`);
        }

        // S3に書き戻し
        const putCommand = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: FILE_KEY,
            Body: JSON.stringify(existingReviews, null, 2),
            ContentType: 'application/json',
            Metadata: {
                'last-updated': new Date().toISOString(),
                'total-reviews': existingReviews.length.toString()
            }
        });

        await s3Client.send(putCommand);
        console.log('Successfully updated review.json in S3');

        // 成功レスポンス
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Review saved successfully',
                review_id: reviewData.review_id,
                total_reviews: existingReviews.length
            })
        };

    } catch (error) {
        console.error('Error processing request:', error);

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message
            })
        };
    }
}

/**
 * Streamを文字列に変換
 */
async function streamToString(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf-8');
}
