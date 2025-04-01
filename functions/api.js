// 노션 DB에 게시물 추가
async function addThreadToNotion(threadInfo) {
  try {
    // 이미 존재하는지 확인
    const existingPages = await notion.databases.query({
      database_id: process.env.NOTION_DATABASE_ID,
      filter: {
        property: "URL",
        url: {
          equals: threadInfo.url
        }
      }
    });
    
    // 이미 존재하면 건너뛰기
    if (existingPages.results.length > 0) {
      console.log(`URL ${threadInfo.url}는 이미 존재합니다`);
      return {
        success: true,
        message: '이미 저장된 게시물입니다',
        existing: true,
        id: existingPages.results[0].id
      };
    }
    
    // 현재 날짜 및 시간 포맷팅
    const now = new Date();
    const formattedDate = now.toISOString();
    
    // 사용자 이름 정보 추출 (URL에서)
    const usernameMatch = threadInfo.url.match(/@([^\/]+)/);
    const username = usernameMatch ? usernameMatch[1] : '알 수 없음';
    
    // 제목 생성 (사용자 이름 + 날짜 조합)
    const title = `${username}의 쓰레드 (${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')})`;
    
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
                content: title
              }
            }
          ]
        },
        "URL": {
          url: threadInfo.url
        },
        "생성 일시": {
          date: {
            start: formattedDate
          }
        },
        "구분": {
          select: {
            name: "쓰레드"
          }
        },
        "원본 글 작성자": {
          rich_text: [
            {
              text: {
                content: username
              }
            }
          ]
        },
        "최초 작성된 곳": {
          rich_text: [
            {
              text: {
                content: "쓰레드(Threads)"
              }
            }
          ]
        },
        "중요도": {
          select: {
            name: "보통"
          }
        }
      }
    });
    
    console.log(`게시물이 성공적으로 추가되었습니다: ${threadInfo.url}`);
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
