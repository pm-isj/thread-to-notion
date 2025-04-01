const serverless = require('serverless-http');
const express = require('express');
const { Client } = require('@notionhq/client');
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const bodyParser = require('body-parser');

// 서버 초기화
const app = express();
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

// 미들웨어
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 브라우저 초기화 함수
async function getBrowser() {
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

// 쓰레드 게시물 정보 가져오기
async function getThreadPostInfo(url) {
  // URL 유효성 검사
  if (!url || !url.includes('threads.net')) {
    throw new Error('유효한 쓰레드 URL이 아닙니다');
  }
  
  console.log(`게시물 정보 가져오는 중: ${url}`);
  
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1');
  
  try {
    // 페이지 로드
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // 게시물 데이터 추출
    const postData = await page.evaluate(() => {
      // 게시물 ID 추출
      const postId = window.location.pathname.split('/post/')[1]?.split('/')[0] || 
                    window.location.pathname.split('/t/')[1]?.split('/')[0] || '';
      
      // 작성자 정보
      const authorElement = document.querySelector('a[href*="/@"]');
      const authorUsername = authorElement ? 
        authorElement.href.split('/@')[1]?.split('/')[0] || '' : '';
      const authorName = authorElement ? 
        authorElement.textContent.trim() || authorUsername : authorUsername;
      
      // 게시물 내용
      const contentElement = document.querySelector('article div[role="button"] > div > span') || 
                            document.querySelector('article p');
      const content = contentElement ? contentElement.textContent.trim() : '';
      
      // 이미지 URL 추출
      const imageElements = Array.from(document.querySelectorAll('article img[style*="object-fit"]'));
      const imageUrls = imageElements
        .map(img => img.src)
        .filter(src => src && !src.includes('profile-pic'));
      
      // 게시 날짜
      const timeElement = document.querySelector('time');
      const timestamp = timeElement ? timeElement.dateTime : '';
      const displayDate = timeElement ? timeElement.textContent.trim() : '';
      
      // 좋아요 및 댓글 수
      const statElements = Array.from(document.querySelectorAll('article div[role="button"] > div'));
      let likes = '0';
      let comments = '0';
      
      if (statElements.length >= 2) {
        likes = statElements[0]?.textContent?.trim() || '0';
        comments = statElements[1]?.textContent?.trim() || '0';
      }
      
      return {
        id: postId,
        author: {
          username: authorUsername,
          name: authorName
        },
        content,
        url: window.location.href,
        imageUrls,
        timestamp,
        displayDate,
        likes,
        comments
      };
    });
    
    console.log('게시물 데이터 추출 완료:', postData.id);
    return postData;
  } catch (error) {
    console.error('게시물 정보 가져오기 실패:', error);
    throw error;
  } finally {
    await browser.close();
  }
}
// 노션 DB에 게시물 추가
async function addPostToNotion(post) {
  try {
    // 이미 존재하는지 확인 (Post ID로)
    const existingPages = await notion.databases.query({
      database_id: process.env.NOTION_DATABASE_ID,
      filter: {
        or: [
          {
            property: "Post ID",
            rich_text: {
              equals: post.id
            }
          },
          {
            property: "URL",
            url: {
              equals: post.url
            }
          }
        ]
      }
    });
    
    // 이미 존재하면 건너뛰기
    if (existingPages.results.length > 0) {
      console.log(`게시물 ID ${post.id}는 이미 존재합니다. 건너뜁니다.`);
      return {
        success: true,
        message: '이미 저장된 게시물입니다',
        existing: true,
        id: existingPages.results[0].id
      };
    }
    
    // 이미지 블록 준비
    const imageBlocks = post.imageUrls.map(url => ({
      object: "block",
      type: "image",
      image: {
        type: "external",
        external: {
          url
        }
      }
    }));
    
    // 노션에 새 페이지 생성
    const response = await notion.pages.create({
      parent: {
        database_id: process.env.NOTION_DATABASE_ID,
      },
      properties: {
        "제목": {
          title: [
            {
              text: {
                content: post.content.substring(0, 100) + (post.content.length > 100 ? '...' : '')
              }
            }
          ]
        },
        "내용": {
          rich_text: [
            {
              text: {
                content: post.content.length > 2000 ? 
                  post.content.substring(0, 2000) + '...' : post.content
              }
            }
          ]
        },
        "작성자": {
          rich_text: [
            {
              text: {
                content: post.author.name || post.author.username
              }
            }
          ]
        },
        "작성자ID": {
          rich_text: [
            {
              text: {
                content: post.author.username
              }
            }
          ]
        },
        "Post ID": {
          rich_text: [
            {
              text: {
                content: post.id
              }
            }
          ]
        },
        "URL": {
          url: post.url
        },
        "작성일": {
          date: {
            start: post.timestamp || new Date().toISOString()
          }
        },
        "저장일": {
          date: {
            start: new Date().toISOString()
          }
        },
        "좋아요 수": {
          number: parseInt(post.likes.replace(/[^\d]/g, '')) || 0
        },
        "댓글 수": {
          number: parseInt(post.comments.replace(/[^\d]/g, '')) || 0
        }
      },
      children: imageBlocks
    });
    
    console.log(`게시물이 성공적으로 추가되었습니다: ${post.id}`);
    return {
      success: true,
      message: '게시물이 노션에 저장되었습니다',
      id: response.id
    };
  } catch (error) {
    console.error(`게시물 추가 중 오류 발생: ${error.message}`);
    throw error;
  }
}
// API 엔드포인트: 웹훅으로 게시물 URL 받기
app.post('/add-thread', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ 
      success: false, 
      message: 'URL이 제공되지 않았습니다' 
    });
  }
  
  try {
    // 쓰레드 게시물 정보 가져오기
    const postInfo = await getThreadPostInfo(url);
    
    // 노션에 저장
    const result = await addPostToNotion(postInfo);
    
    return res.json(result);
  } catch (error) {
    console.error('처리 중 오류 발생:', error);
    return res.status(500).json({ 
      success: false, 
      message: `오류 발생: ${error.message}` 
    });
  }
});

// 웹 페이지 제공 (모바일에서 접근 가능)
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>쓰레드 게시물 노션에 저장하기</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 500px;
          margin: 0 auto;
          padding: 20px;
        }
        h1 {
          font-size: 24px;
          margin-bottom: 20px;
        }
        .form-group {
          margin-bottom: 15px;
        }
        label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
        }
        input[type="text"] {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          box-sizing: border-box;
        }
        button {
          background-color: #0095f6;
          color: white;
          border: none;
          padding: 10px 15px;
          border-radius: 4px;
          cursor: pointer;
          font-weight: bold;
        }
        .result {
          margin-top: 20px;
          padding: 10px;
          border-radius: 4px;
        }
        .success {
          background-color: #e3f2fd;
          color: #0d47a1;
        }
        .error {
          background-color: #ffebee;
          color: #c62828;
        }
        .hidden {
          display: none;
        }
        .loading {
          text-align: center;
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <h1>쓰레드 게시물 노션에 저장하기</h1>
      
      <div class="form-group">
        <label for="threadUrl">쓰레드 게시물 URL:</label>
        <input type="text" id="threadUrl" placeholder="https://www.threads.net/@username/post/...">
      </div>
      
      <button id="saveButton">노션에 저장하기</button>
      
      <div id="loading" class="loading hidden">
        저장 중... 잠시만 기다려주세요.
      </div>
      
      <div id="result" class="result hidden"></div>
      
      <script>
        document.getElementById('saveButton').addEventListener('click', async () => {
          const url = document.getElementById('threadUrl').value.trim();
          const resultDiv = document.getElementById('result');
          const loadingDiv = document.getElementById('loading');
          
          if (!url) {
            resultDiv.className = 'result error';
            resultDiv.textContent = 'URL을 입력해주세요';
            resultDiv.classList.remove('hidden');
            return;
          }
          
          // URL 유효성 검사
          if (!url.includes('threads.net')) {
            resultDiv.className = 'result error';
            resultDiv.textContent = '유효한 쓰레드 URL이 아닙니다';
            resultDiv.classList.remove('hidden');
            return;
          }
          
          try {
            resultDiv.classList.add('hidden');
            loadingDiv.classList.remove('hidden');
            
            const response = await fetch('/add-thread', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ url }),
            });
            
            const data = await response.json();
            
            loadingDiv.classList.add('hidden');
            resultDiv.classList.remove('hidden');
            
            if (data.success) {
              resultDiv.className = 'result success';
              resultDiv.textContent = data.message;
            } else {
              resultDiv.className = 'result error';
              resultDiv.textContent = data.message || '오류가 발생했습니다';
            }
          } catch (error) {
            loadingDiv.classList.add('hidden');
            resultDiv.classList.remove('hidden');
            resultDiv.className = 'result error';
            resultDiv.textContent = '서버 오류가 발생했습니다: ' + error.message;
          }
        });
      </script>
    </body>
    </html>
  `);
});

// 서버리스 함수로 내보내기
module.exports.handler = serverless(app);
