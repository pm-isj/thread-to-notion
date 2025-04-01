const serverless = require('serverless-http');
const express = require('express');
const { Client } = require('@notionhq/client');

const app = express();

app.get('/', async (req, res) => {
  try {
    const notion = new Client({
      auth: process.env.NOTION_TOKEN
    });

    // 데이터베이스 쿼리 시도
    const response = await notion.databases.query({
      database_id: process.env.NOTION_DATABASE_ID,
      page_size: 1
    });

    res.json({
      message: 'Notion 연동 성공',
      databaseId: process.env.NOTION_DATABASE_ID,
      pageCount: response.results.length
    });
  } catch (error) {
    console.error('Notion 연동 중 오류:', error);
    res.status(500).json({
      message: 'Notion 연동 실패',
      error: error.message
    });
  }
});

module.exports.handler = serverless(app);
