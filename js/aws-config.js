/**
 * AWS設定ファイル
 *
 * 注意: このファイルには実際の認証情報が含まれるため、
 * .gitignoreに追加してGitにコミットしないでください。
 */

const AWS_CONFIG = {
    region: 'ap-northeast-1',
    bucketName: 'sakuraqa-food-review-results', // Lambda関数で使用されるバケット名（参考用）
    apiEndpoint: 'https://ogllpkngp1.execute-api.ap-northeast-1.amazonaws.com/review', // 実際のAPI GatewayのURL
    enableS3Upload: true // レビュー保存時にAPIへ送信するかどうか
};

// グローバルスコープに公開
window.AWS_CONFIG = AWS_CONFIG;
