/**
 * review.jsonから進捗を復元してprogress.jsonを生成するスクリプト
 *
 * 使い方:
 * 1. AWS_REGION, S3_BUCKET_NAME を環境変数に設定
 * 2. node scripts/migrate-progress.mjs
 */

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const REGION = process.env.AWS_REGION || 'ap-northeast-1';
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'sakuraqa-food-review-results';
const REVIEW_FILE_KEY = 'review.json';
const PROGRESS_FILE_KEY = 'progress.json';

const s3Client = new S3Client({ region: REGION });

async function streamToString(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf-8');
}

async function migrateProgress() {
    try {
        console.log('S3からreview.jsonを取得中...');

        // review.jsonを取得
        const getCommand = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: REVIEW_FILE_KEY
        });

        const response = await s3Client.send(getCommand);
        const bodyContents = await streamToString(response.Body);
        const reviews = JSON.parse(bodyContents);

        console.log(`${reviews.length}件のレビュー結果を取得しました`);

        // レビュアー × カテゴリ ごとの最後の問題インデックスを抽出
        const progressMap = {};

        reviews.forEach(review => {
            const reviewerName = review.reviewer_name;
            const category = review.category;
            const questionIndex = review.question_index;

            const key = `${reviewerName}__${category}`;

            // 既存の進捗と比較して、より大きいインデックスを保持
            if (!progressMap[key] || progressMap[key].questionIndex < questionIndex) {
                progressMap[key] = {
                    reviewerName,
                    category,
                    questionIndex,
                    timestamp: review.timestamp
                };
            }
        });

        console.log('\n生成された進捗:');
        Object.entries(progressMap).forEach(([key, progress]) => {
            console.log(`  ${key}: 問題${progress.questionIndex + 1}まで完了`);
        });

        // progress.jsonとしてS3に保存
        console.log('\nS3にprogress.jsonを保存中...');

        const putCommand = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: PROGRESS_FILE_KEY,
            Body: JSON.stringify(progressMap, null, 2),
            ContentType: 'application/json',
            Metadata: {
                'last-updated': new Date().toISOString(),
                'migrated-from': 'review.json'
            }
        });

        await s3Client.send(putCommand);

        console.log('✅ 進捗の移行が完了しました！');
        console.log(`   合計 ${Object.keys(progressMap).length} 件の進捗を保存しました`);

    } catch (error) {
        console.error('❌ エラーが発生しました:', error);
        process.exit(1);
    }
}

migrateProgress();
