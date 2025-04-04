// server.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csvParser = require('csv-parser');
const XLSX = require('xlsx');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.PORT || 3000;

// 미들웨어 설정
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // HTML, CSS, JS 파일 서빙

// 파일 업로드를 위한 multer 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // 업로드된 파일이 저장될 디렉토리
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // 파일 이름 중복 방지
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    // 허용할 파일 타입
    if (
      file.mimetype === 'text/csv' || 
      file.mimetype === 'application/vnd.ms-excel' || 
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      cb(null, true);
    } else {
      cb(new Error('지원되지 않는 파일 형식입니다. CSV 또는 Excel 파일만 업로드 가능합니다.'));
    }
  }
});

// 업로드 디렉토리 생성
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// 데이터 저장소 (간단한 In-Memory DB)
let students = [];
let courses = [];
let courseStudents = {}; // 과정별 학생 데이터 저장

// 파일 업로드 및 파싱 라우트
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
    }

    const filePath = file.path;
    const fileExt = path.extname(file.originalname).toLowerCase();

    if (fileExt === '.csv') {
      parseCSV(filePath, (parsedData) => {
        students = parsedData;
        res.json({ success: true, count: students.length });
      });
    } else if (fileExt === '.xlsx' || fileExt === '.xls') {
      parseExcel(filePath, (parsedData) => {
        students = parsedData;
        res.json({ success: true, count: students.length });
      });
    } else {
      res.status(400).json({ error: '지원되지 않는 파일 형식입니다.' });
    }
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ error: '파일 업로드 중 오류가 발생했습니다.' });
  }
});

// CSV 파일을 직접 파싱하는 함수 (인덱스 기반 접근)
function parseCSV(filePath, callback) {
  const results = [];
  
  fs.createReadStream(filePath)
    .pipe(csvParser({
      headers: false,
      skipLines: 1
    }))
    .on('data', (row) => {
      // 나이 계산
      let age = 0;
      const birthDate = row[10]; // K열의 생년월일
      if (birthDate) {
        try {
          const birthYear = parseInt(birthDate.split('-')[0]); // YYYY-MM-DD 형식에서 연도 추출
          const today = new Date();
          age = today.getFullYear() - birthYear;
        } catch (error) {
          console.log('Age calculation error:', error);
        }
      }

      const student = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        name: row[7],        // H열: 가입 이름
        gender: row[11],     // L열: 성별
        age: age,            // 계산된 나이
        phone: row[8],       // I열: 가입 연락처
        email: row[9],       // J열: 지원서 이메일
        status: 'applying',
        lastContactDate: new Date().toISOString().split('T')[0],
        updatedAt: new Date().toISOString()
      };
      
      console.log('Created student:', student);
      results.push(student);
    })
    .on('end', () => {
      callback(results);
      fs.unlink(filePath, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    });
}

function formatStudentData(data) {
  // 디버깅용 로그
  console.log('Raw data:', data);
  
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    name: data['가입 이름'] || '',        // I열
    gender: data['성별'] || '',          // L열
    age: 0,  // 생년월일 컬럼이 보이지 않아 일단 0으로
    phone: data['가입 연락처'] || '',     // J열
    email: data['지원서 이메일'] || '',   // K열
    status: 'applying',
    lastContactDate: new Date().toISOString().split('T')[0],
    updatedAt: new Date().toISOString()
  };
}

// Excel 파일 파싱 함수
function parseExcel(filePath, callback) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {header: 1});
    
    console.log('Excel 파싱 시작:', filePath);
    console.log('Excel 헤더:', jsonData[0]);
    
    // 결과 배열
    const results = [];
    
    // 첫 행은 헤더로 가정하고 건너뜀
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      
      // 필요한 데이터 추출
      // h컬럼(7번 인덱스): 이름
      // i컬럼(8번 인덱스): 연락처
      // j컬럼(9번 인덱스): 이메일
      // k컬럼(10번 인덱스): 생년월일
      
      if (!row || row.length < 8) continue; // 데이터가 부족한 행 건너뛰기
      
      const name = row.length > 7 ? row[7] : '';
      const phone = row.length > 8 ? row[8] : '';
      const email = row.length > 9 ? row[9] : '';
      const birthdate = row.length > 10 ? row[10] : '';
      
      if (i <= 3) { // 처음 몇 개 레코드만 디버깅 출력
        console.log(`Excel 행 ${i} 데이터:`, {
          이름: name,
          연락처: phone,
          이메일: email,
          생년월일: birthdate
        });
      }
      
      // 데이터가 비어있는 경우 건너뛰기
      if (!name && !phone) continue;
      
      const formattedData = {
        id: Date.now() + i,
        name: name || '',
        gender: determineGender(name),
        age: getAge(birthdate),
        phone: phone || '',
        email: email || '',
        status: 'applying',
        consideringReason: null,
        lastContactDate: new Date().toISOString().split('T')[0],
        notes: '',
        updatedAt: new Date().toISOString()
      };
      
      results.push(formattedData);
    }
    
    console.log(`총 ${results.length}명의 Excel 데이터가 파싱되었습니다.`);
    callback(results);
    
    // 임시 파일 삭제
    fs.unlink(filePath, (err) => {
      if (err) console.error('Error deleting file:', err);
    });
  } catch (error) {
    console.error('Excel parsing error:', error);
    callback([]);
  }
}

// 모든 학생 데이터 가져오기
app.get('/api/students', (req, res) => {
  res.json(students);
});

// 학생 상태 업데이트
app.put('/api/students/:id', (req, res) => {
  const studentId = parseInt(req.params.id);
  const updatedData = req.body;
  
  const studentIndex = students.findIndex(s => s.id === studentId);
  
  if (studentIndex === -1) {
    return res.status(404).json({ error: '학생을 찾을 수 없습니다.' });
  }
  
  // 데이터 업데이트
  students[studentIndex] = {
    ...students[studentIndex],
    ...updatedData,
    updatedAt: new Date().toISOString()
  };
  
  res.json(students[studentIndex]);
});

// 과정 추가 API
app.post('/api/courses', (req, res) => {
  const newCourse = {
    id: Date.now().toString(),
    name: req.body.name,
    createdAt: new Date().toISOString()
  };
  
  courses.push(newCourse);
  res.json(newCourse);
});

// 과정 목록 조회
app.get('/api/courses', (req, res) => {
  res.json(courses);
});

// 특정 과정 조회
app.get('/api/courses/:id', (req, res) => {
  const course = courses.find(c => c.id === req.params.id);
  if (!course) return res.status(404).json({ error: '과정을 찾을 수 없습니다.' });
  res.json(course);
});

// 과정별 CSV 업로드
app.post('/api/courses/:id/upload', upload.single('file'), (req, res) => {
  const courseId = req.params.id;
  // ... 기존 CSV 처리 로직 ...
  // 처리된 데이터를 해당 과정의 학생 목록에 저장
  courseStudents[courseId] = results;
  res.json({ success: true, count: results.length });
});

// 과정별 통계 API
app.get('/api/courses/:courseId/stats', (req, res) => {
  const courseId = parseInt(req.params.courseId);
  const students = courseStudents[courseId] || [];
  
  const stats = {
    total: students.length,
    statusCount: {
      applying: students.filter(s => s.status === 'applying').length,
      accepted: students.filter(s => s.status === 'accepted').length,
      rejected: students.filter(s => s.status === 'rejected').length,
      cancelled: students.filter(s => s.status === 'cancelled').length
    },
    cancelReasons: {} // 취소 사유 집계
  };
  
  // 취소 사유 집계
  students
    .filter(s => s.status === 'cancelled')
    .forEach(s => {
      stats.cancelReasons[s.consideringReason] = 
        (stats.cancelReasons[s.consideringReason] || 0) + 1;
    });
    
  res.json(stats);
});

// 메인 HTML 페이지 서빙
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 서버 시작
app.listen(port, () => {
  console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
});

// 이름으로 성별 추측 (간단한 구현)
function determineGender(name) {
  // 한국어 이름에서 성별을 추측하는 간단한 방법
  if (!name) return '';
  
  // 여성 이름에 많이 사용되는 글자
  const femaleChars = ['지', '지현', '현', '예', '민', '지민', '현아', '서', '서연', '연', '은', '지은', '은지'];
  // 남성 이름에 많이 사용되는 글자
  const maleChars = ['민', '준', '현', '민준', '준호', '석', '승', '우', '석우', '승호', '민우', '철', '석호'];
  
  // 여성 이름에 많이 사용되는 글자가 포함되어 있는지 확인
  for (const char of femaleChars) {
    if (name.includes(char)) return 'female';
  }
  
  // 남성 이름에 많이 사용되는 글자가 포함되어 있는지 확인
  for (const char of maleChars) {
    if (name.includes(char)) return 'male';
  }
  
  return ''; // 결정할 수 없는 경우
}

// 생년월일에서 나이 계산 함수
function getAge(birthdate) {
  if (!birthdate) return 0;
  
  // 다양한 날짜 형식 처리 시도
  let birthYear = null;
  
  // YYYY-MM-DD 또는 YYYY/MM/DD 형식
  if (birthdate.match(/^\d{4}[\-\/]\d{1,2}[\-\/]\d{1,2}$/)) {
    birthYear = parseInt(birthdate.split(/[\-\/]/)[0]);
  } 
  // YYMMDD 또는 YY-MM-DD 형식
  else if (birthdate.match(/^\d{2}[\-\/]?\d{2}[\-\/]?\d{2}$/)) {
    const year = birthdate.substring(0, 2);
    birthYear = parseInt(year) + (parseInt(year) > 30 ? 1900 : 2000);
  }
  // 년월일 형식 (예: 1990년 01월 01일)
  else if (birthdate.includes('년')) {
    const match = birthdate.match(/(\d{4})년/);
    if (match) birthYear = parseInt(match[1]);
  }
  // 8자리 숫자 (YYYYMMDD)
  else if (birthdate.match(/^\d{8}$/)) {
    birthYear = parseInt(birthdate.substring(0, 4));
  }
  // 6자리 숫자 (YYMMDD)
  else if (birthdate.match(/^\d{6}$/)) {
    const year = birthdate.substring(0, 2);
    birthYear = parseInt(year) + (parseInt(year) > 30 ? 1900 : 2000);
  }
  
  if (birthYear) {
    const currentYear = new Date().getFullYear();
    return currentYear - birthYear;
  }
  
  return 0;
}