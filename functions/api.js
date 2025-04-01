const serverless = require('serverless-http');
const express = require('express');
const bodyParser = require('body-parser');
const { Client } = require('@notionhq/client');

// 환경 변수 로깅 (dotenv 제거)
console.log('프로세스 환경 변수:', JSON.stringify(process.env, null, 2));

// 안전한 Notion 클라이언트 초기화
let notion;
try {
  // 환경 변수 직접 접근
  const notionToken = process.env.NOTION_TOKEN;
  const notionDatabaseId = process.env.NOTION_DATABASE_ID;

  console.log('Notion 토큰 존재 여부:', !!notionToken);
  console.log('Notion 데이터베이스 ID 존재 여부:', !!notionDatabaseId);

  if (!notionToken || !notionDatabaseId) {
    throw new Error('Notion 토큰 또는 데이터베이스 ID가 누락되었습니다');
  }

  notion = new Client({
    auth: notionToken
  });
  console.log('Notion 클라이언트 초기화 성공');
} catch (error) {
  console.error('Notion 클라이언트 초기화 실패:', error);
}

// 노션 DB에 게시물 추가 함수
async function addThreadToNotion(threadInfo) {
  console.log('addThreadToNotion 함수 호출됨');
  
  try {
    if (!notion) {
      throw new Error('Notion 클라이언트가 초기화되지 않았습니다');
    }

    const databaseId = process.env.NOTION_DATABASE_ID;
    console.log('사용할 데이터베이스 ID:', databaseId);

    // 더미 테스트용 데이터 추가
    const response = await notion.pages.create({
      parent: {
        database_id: databaseId,
      },
      properties: {
        "제목": {
          title: [
            {
              text: {
                content: "테스트 페이지 " + new Date().toISOString()
              }
            }
          ]
        }
      }
    });
    
    console.log('테스트 페이지 생성 성공:', response.id);
    return {
      success: true,
      message: '테스트 페이지가 생성되었습니다',
      id: response.id
    };
  } catch (error) {
    console.error(`페이지 생성 중 오류 발생: ${error.message}`);
    console.error('전체 에러:', error);
    throw error;
  }
}

// Express 앱 생성
const app = express();

// 미들웨어 설정
app.use(bodyParser.json());

// GET 디버깅 엔드포인트 추가
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Netlify 함수가 성공적으로 실행되었습니다!',
    status: 'OK',
    env: {
      NOTION_TOKEN: process.env.NOTION_TOKEN ? '설정됨' : '미설정',
      NOTION_DATABASE_ID: process.env.NOTION_DATABASE_ID ? '설정됨' : '미설정'
    },
    nodeEnv: process.env.NODE_ENV,
    netlifyContext: process.env.CONTEXT
  });
});

// POST 엔드포인트 추가 (테스트용)
app.post('/thread-to-notion', async (req, res) => {
  try {
    const result = await addThreadToNotion(req.body || {});
    res.status(200).json(result);
  } catch (error) {
    console.error('API 처리 중 오류:', error);
    res.status(500).json({ 
      success: false, 
      message: '서버 오류가 발생했습니다', 
      error: error.message 
    });
  }
});

// Netlify 서버리스 함수로 내보내기
module.exports.handler = serverless(app);
