// src/services/firestoreApi.ts
// Firestore 데이터베이스 연동 API

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  Timestamp,
  collectionGroup,
  writeBatch
} from 'firebase/firestore';
import { db } from './firebase';

// ========================================
// 타입 정의
// ========================================

// 선생님 정보
export interface Teacher {
  uid: string;
  email: string;
  name: string;
  schoolName: string;
  dahandinApiKey: string;
  createdAt: Timestamp;
}

// 뱃지 정보
export interface Badge {
  hasBadge: boolean;
  imgUrl: string;
  title: string;
}

// 학생 정보
export interface Student {
  code: string;
  number: number;
  name: string;
  classId: string;
  teacherId: string;
  cookie: number;
  jelly: number;                // 캔디 (게임/상점용 재화)
  lastSyncedCookie: number;     // 마지막 동기화 시점의 쿠키 값
  usedCookie: number;
  totalCookie: number;
  chocoChips: number;
  previousCookie: number;
  initialCookie: number; // 등록 시점의 쿠키 수 (잔디 계산용)
  profile: {
    emojiCode: string;
    title: string;
    titleColorCode: string;
    borderCode?: string; // deprecated - 더이상 사용하지 않음
    nameEffectCode: string;
    backgroundCode: string;
    buttonBorderCode?: string;
    buttonFillCode?: string;
    animationCode?: string;
    titlePermitActive?: boolean; // 칭호권 활성화 여부
    profileBadgeKey?: string; // 프로필에 표시할 뱃지 키
    profilePhotoActive?: boolean; // 프로필사진권 활성화 여부
  };
  ownedItems: string[];
  profilePhotoUrl?: string; // 프로필 사진 URL
  badges?: Record<string, Badge>;
  lastUpdate: Timestamp | null;
  // 소원 streak 관련
  wishStreak?: number;
  bestWishStreak?: number;
  // 스트릭 프리즈 관련
  streakFreezes?: number; // 보유 개수
  activeStreakFreezes?: number; // 활성화된 개수
  lastWishDate?: Timestamp | null;
}

// 학급 정보
export interface ClassInfo {
  id: string;
  name: string;
  studentCount: number;
  active: boolean;
  teacherId: string;
  createdAt: Timestamp;
  lastCookieRefresh?: Timestamp | null;
}

// 새로고침 간격 (4시간 = 4 * 60 * 60 * 1000 밀리초)
const REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000;

// 팀 정보
export interface Team {
  teamId: string;
  teamName: string;
  flag: string;
  members: string[];
  teamCookie: number;
  createdAt?: Timestamp; // 팀 결성일
}

// 학급 그룹 정보 (소원 공유용)
export interface ClassGroup {
  id: string;
  name: string;
  classIds: string[];
  createdAt: Timestamp;
}

// 소원 정보
export interface Wish {
  id: string;
  studentCode: string;
  studentName: string;
  content: string;
  createdAt: Timestamp;
  likes: string[];
  isGranted: boolean;
  grantedReward: number;  // deprecated - 더이상 사용하지 않음
  grantedMessage?: string; // 선정 시 교사 코멘트
  grantedAt?: Timestamp; // 선정된 시각 (24시간 후 자동 삭제용)
  classId: string; // 소원이 속한 학급 ID
}

// 상점 아이템
export interface ShopItem {
  code: string;
  category: string;
  name: string;
  price: number;
  value: string;
  description: string;
  maxCount?: number; // 스트릭 프리즈 전용: 최대 보유 개수
}

// 쿠키 상점 아이템 (실물 교환)
export interface CookieShopItem {
  id: string;
  name: string;
  description: string;
  price: number;  // 다했니 쿠키 차감량
  stock?: number; // 재고 (없으면 무제한)
  imageUrl?: string;
  isActive: boolean;
  createdAt: Timestamp;
}

// 쿠키 상점 신청
export interface CookieShopRequest {
  id: string;
  itemId: string;
  itemName: string;
  itemPrice: number;
  studentCode: string;
  studentName: string;
  studentNumber: number;
  classId: string;
  className: string;
  quantity: number;
  totalPrice: number;  // price * quantity
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  teacherResponse?: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

// ========================================
// 선생님 API
// ========================================

// 선생님 정보 저장 (회원가입 시)
export async function createTeacher(
  uid: string,
  email: string,
  name: string,
  schoolName: string,
  dahandinApiKey: string
): Promise<void> {
  const teacherRef = doc(db, 'teachers', uid);
  await setDoc(teacherRef, {
    uid,
    email,
    name,
    schoolName,
    dahandinApiKey,
    createdAt: serverTimestamp()
  });
}

// 선생님 정보 조회
export async function getTeacher(uid: string): Promise<Teacher | null> {
  const teacherRef = doc(db, 'teachers', uid);
  const teacherSnap = await getDoc(teacherRef);
  
  if (teacherSnap.exists()) {
    return teacherSnap.data() as Teacher;
  }
  return null;
}

// 선생님 정보 수정
export async function updateTeacher(
  uid: string,
  data: Partial<Pick<Teacher, 'name' | 'schoolName' | 'dahandinApiKey'>>
): Promise<void> {
  const teacherRef = doc(db, 'teachers', uid);
  await updateDoc(teacherRef, data);
}

// ========================================
// 학급 API
// ========================================

// 학급 생성
export async function createClass(
  teacherId: string,
  classId: string,
  className: string
): Promise<void> {
  const classRef = doc(db, 'teachers', teacherId, 'classes', classId);
  await setDoc(classRef, {
    id: classId,
    name: className,
    studentCount: 0,
    active: true,
    teacherId,
    createdAt: serverTimestamp()
  });
}

// 선생님의 학급 목록 조회
export async function getClasses(teacherId: string): Promise<ClassInfo[]> {
  const classesRef = collection(db, 'teachers', teacherId, 'classes');
  const q = query(classesRef, where('active', '==', true));
  const snapshot = await getDocs(q);

  // 각 학급의 실제 학생 수를 계산
  const classes = await Promise.all(snapshot.docs.map(async (classDoc) => {
    const classData = classDoc.data();

    // 해당 학급의 학생 수 직접 조회
    const studentsRef = collection(db, 'teachers', teacherId, 'students');
    const studentsQuery = query(studentsRef, where('classId', '==', classDoc.id));
    const studentsSnapshot = await getDocs(studentsQuery);
    const actualStudentCount = studentsSnapshot.size;

    return {
      id: classDoc.id,
      ...classData,
      studentCount: actualStudentCount // 실제 학생 수로 덮어쓰기
    } as ClassInfo;
  }));

  return classes;
}

// 학급 정보 수정
export async function updateClass(
  teacherId: string,
  classId: string,
  data: Partial<ClassInfo>
): Promise<void> {
  const classRef = doc(db, 'teachers', teacherId, 'classes', classId);
  await updateDoc(classRef, data);
}

// ========================================
// 학생 API
// ========================================

// 학생 등록
export async function createStudent(
  teacherId: string,
  classId: string,
  student: Omit<Student, 'teacherId' | 'classId' | 'lastUpdate'>
): Promise<void> {
  const studentRef = doc(db, 'teachers', teacherId, 'students', student.code);
  await setDoc(studentRef, {
    ...student,
    teacherId,
    classId,
    // previousCookie를 현재 쿠키값으로 설정하여 첫 새로고침 시 잘못된 증가분 방지
    previousCookie: student.cookie || 0,
    lastSyncedCookie: student.cookie || 0,
    lastUpdate: serverTimestamp()
  });
  
  // 학급 학생 수 증가
  const classRef = doc(db, 'teachers', teacherId, 'classes', classId);
  await updateDoc(classRef, {
    studentCount: increment(1)
  });
}

// 학생코드로 학생 찾기 (로그인용) - 모든 선생님의 학생 검색
export async function findStudentByCode(code: string): Promise<{
  student: Student;
  teacherId: string;
  teacher: Teacher;
} | null> {
  // 모든 teachers의 students 서브컬렉션에서 검색
  const teachersRef = collection(db, 'teachers');
  const teachersSnap = await getDocs(teachersRef);
  
  for (const teacherDoc of teachersSnap.docs) {
    const studentRef = doc(db, 'teachers', teacherDoc.id, 'students', code);
    const studentSnap = await getDoc(studentRef);
    
    if (studentSnap.exists()) {
      const student = studentSnap.data() as Student;
      const teacher = teacherDoc.data() as Teacher;
      
      return {
        student,
        teacherId: teacherDoc.id,
        teacher
      };
    }
  }
  
  return null;
}

// 특정 학생 조회
export async function getStudent(
  teacherId: string,
  studentCode: string
): Promise<Student | null> {
  const studentRef = doc(db, 'teachers', teacherId, 'students', studentCode);
  const studentSnap = await getDoc(studentRef);
  
  if (studentSnap.exists()) {
    return studentSnap.data() as Student;
  }
  return null;
}

// 학급의 모든 학생 조회
export async function getClassStudents(
  teacherId: string,
  classId: string
): Promise<Student[]> {
  const studentsRef = collection(db, 'teachers', teacherId, 'students');
  const q = query(studentsRef, where('classId', '==', classId), orderBy('number'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => doc.data()) as Student[];
}

// 학생 정보 수정
export async function updateStudent(
  teacherId: string,
  studentCode: string,
  data: Partial<Student>
): Promise<void> {
  const studentRef = doc(db, 'teachers', teacherId, 'students', studentCode);
  await updateDoc(studentRef, {
    ...data,
    lastUpdate: serverTimestamp()
  });
}

// 학생에게 캔디 부여 (교사용)
export async function addJellyToStudent(
  teacherId: string,
  studentCode: string,
  amount: number
): Promise<void> {
  const studentRef = doc(db, 'teachers', teacherId, 'students', studentCode);
  await updateDoc(studentRef, {
    jelly: increment(amount),
    lastUpdate: serverTimestamp()
  });
}

// 학생에게 쿠키 부여 (교사용) - deprecated, 호환성 위해 유지 (캔디로 동작)
export async function addCookiesToStudent(
  teacherId: string,
  studentCode: string,
  amount: number
): Promise<void> {
  await addJellyToStudent(teacherId, studentCode, amount);
}

// 학생 삭제
export async function deleteStudent(
  teacherId: string,
  classId: string,
  studentCode: string
): Promise<void> {
  const studentRef = doc(db, 'teachers', teacherId, 'students', studentCode);
  await deleteDoc(studentRef);

  // 학급 학생 수 감소
  const classRef = doc(db, 'teachers', teacherId, 'classes', classId);
  await updateDoc(classRef, {
    studentCount: increment(-1)
  });
}

// 학급의 모든 학생 삭제
export async function deleteAllStudents(
  teacherId: string,
  classId: string
): Promise<number> {
  const students = await getClassStudents(teacherId, classId);
  let deletedCount = 0;

  for (const student of students) {
    const studentRef = doc(db, 'teachers', teacherId, 'students', student.code);
    await deleteDoc(studentRef);
    deletedCount++;
  }

  // 학급 학생 수 0으로 설정
  const classRef = doc(db, 'teachers', teacherId, 'classes', classId);
  await updateDoc(classRef, {
    studentCount: 0
  });

  return deletedCount;
}

// 실시간 학생 목록 구독
export function subscribeToClassStudents(
  teacherId: string,
  classId: string,
  callback: (students: Student[]) => void
): () => void {
  const studentsRef = collection(db, 'teachers', teacherId, 'students');
  const q = query(studentsRef, where('classId', '==', classId), orderBy('number'));
  
  return onSnapshot(q, (snapshot) => {
    const students = snapshot.docs.map(doc => doc.data()) as Student[];
    callback(students);
  });
}

// ========================================
// 소원 API
// ========================================

// 오늘 소원을 이미 작성했는지 확인
export async function checkTodayWish(
  teacherId: string,
  classId: string,
  studentCode: string
): Promise<boolean> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 모든 클래스룸에서 소원 공유 - teacher 레벨에 저장
  const wishesRef = collection(db, 'teachers', teacherId, 'wishes');
  const q = query(wishesRef, where('studentCode', '==', studentCode));
  const snapshot = await getDocs(q);

  return snapshot.docs.some(doc => {
    const wish = doc.data();
    const wishDate = wish.createdAt?.toDate?.();
    if (!wishDate) return false;
    wishDate.setHours(0, 0, 0, 0);
    return wishDate.getTime() === today.getTime();
  });
}

// 소원 추가 (하루 1개 제한)
const MAX_WISH_LENGTH = 100; // 최대 소원 글자 수

export async function addWish(
  teacherId: string,
  classId: string,
  studentCode: string,
  studentName: string,
  content: string
): Promise<{ success: boolean; wishId?: string; error?: string }> {
  // 입력 검증
  if (!content || content.trim().length === 0) {
    return { success: false, error: '소원 내용을 입력해주세요.' };
  }

  if (content.length > MAX_WISH_LENGTH) {
    return { success: false, error: `소원은 ${MAX_WISH_LENGTH}자 이내로 작성해주세요.` };
  }

  // 오늘 이미 소원을 작성했는지 확인
  const alreadyWrote = await checkTodayWish(teacherId, classId, studentCode);
  if (alreadyWrote) {
    return { success: false, error: '오늘은 이미 소원을 작성했어요! 내일 다시 도전해주세요.' };
  }

  // 모든 클래스룸에서 소원 공유 - teacher 레벨에 저장
  const wishesRef = collection(db, 'teachers', teacherId, 'wishes');
  const wishRef = doc(wishesRef);

  await setDoc(wishRef, {
    id: wishRef.id,
    classId,
    studentCode,
    studentName,
    content: content.trim().slice(0, MAX_WISH_LENGTH), // 안전하게 자르기
    createdAt: serverTimestamp(),
    likes: [],
    isGranted: false,
    grantedReward: 0
  });

  // 소원 streak 업데이트
  await updateWishStreak(teacherId, studentCode);

  return { success: true, wishId: wishRef.id };
}

// 소원 streak 업데이트
export async function updateWishStreak(
  teacherId: string,
  studentCode: string
): Promise<void> {
  const studentRef = doc(db, 'teachers', teacherId, 'students', studentCode);
  const studentSnap = await getDoc(studentRef);

  if (!studentSnap.exists()) return;

  const student = studentSnap.data();
  const lastWishDate = student.lastWishDate?.toDate?.();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let newStreak = 1;
  let bestStreak = student.bestWishStreak || 0;

  if (lastWishDate) {
    lastWishDate.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // 어제 소원을 작성했으면 streak 연속
    if (lastWishDate.getTime() === yesterday.getTime()) {
      newStreak = (student.wishStreak || 0) + 1;
    }
  }

  if (newStreak > bestStreak) {
    bestStreak = newStreak;
  }

  await updateDoc(studentRef, {
    wishStreak: newStreak,
    bestWishStreak: bestStreak,
    lastWishDate: serverTimestamp()
  });
}

// 소원 목록 조회 (해당 클래스만)
export async function getWishes(
  teacherId: string,
  classId: string
): Promise<Wish[]> {
  const wishesRef = collection(db, 'teachers', teacherId, 'wishes');

  let snapshot;
  if (classId) {
    // 특정 클래스의 소원만 조회
    const q = query(wishesRef, where('classId', '==', classId));
    snapshot = await getDocs(q);
  } else {
    // classId가 빈 문자열이면 모든 소원 조회 (교사 대시보드용)
    snapshot = await getDocs(wishesRef);
  }

  // JavaScript에서 정렬 (Firestore 인덱스 없이 동작)
  const wishes = snapshot.docs.map(doc => doc.data()) as Wish[];
  return wishes.sort((a, b) => {
    const timeA = a.createdAt?.toMillis?.() || new Date(a.createdAt as any).getTime();
    const timeB = b.createdAt?.toMillis?.() || new Date(b.createdAt as any).getTime();
    return timeB - timeA;
  });
}

// 소원 classId 마이그레이션 (기존 소원에 classId 할당)
export async function migrateWishesClassId(
  teacherId: string
): Promise<{ migrated: number; total: number }> {
  // 1. 모든 소원 가져오기
  const wishesRef = collection(db, 'teachers', teacherId, 'wishes');
  const wishesSnapshot = await getDocs(wishesRef);

  // 2. 모든 학생 정보 가져오기 (studentCode -> classId 맵 생성)
  // 학생은 teachers/{teacherId}/students에 저장되어 있고 classId 필드를 가짐
  const studentsRef = collection(db, 'teachers', teacherId, 'students');
  const studentsSnapshot = await getDocs(studentsRef);

  const studentToClassMap = new Map<string, string>();

  studentsSnapshot.docs.forEach(studentDoc => {
    const data = studentDoc.data();
    const studentCode = data.code || studentDoc.id;
    if (data.classId) {
      studentToClassMap.set(studentCode, data.classId);
    }
  });

  // 3. classId가 없는 소원에 할당
  let migratedCount = 0;
  const batch = writeBatch(db);

  for (const wishDoc of wishesSnapshot.docs) {
    const wishData = wishDoc.data();

    // classId가 없거나 빈 문자열인 경우만 업데이트
    if (!wishData.classId) {
      const studentCode = wishData.studentCode;
      const classId = studentToClassMap.get(studentCode);

      if (classId) {
        const wishRef = doc(db, 'teachers', teacherId, 'wishes', wishDoc.id);
        batch.update(wishRef, { classId });
        migratedCount++;
      }
    }
  }

  if (migratedCount > 0) {
    await batch.commit();
  }

  return { migrated: migratedCount, total: wishesSnapshot.size };
}

// 소원 좋아요 (모든 클래스룸 공유)
export async function likeWish(
  teacherId: string,
  classId: string,
  wishId: string,
  studentCode: string
): Promise<void> {
  const wishRef = doc(db, 'teachers', teacherId, 'wishes', wishId);
  await updateDoc(wishRef, {
    likes: arrayUnion(studentCode)
  });
}

// 소원 좋아요 취소 (모든 클래스룸 공유)
export async function unlikeWish(
  teacherId: string,
  classId: string,
  wishId: string,
  studentCode: string
): Promise<void> {
  const wishRef = doc(db, 'teachers', teacherId, 'wishes', wishId);
  await updateDoc(wishRef, {
    likes: arrayRemove(studentCode)
  });
}

// 소원 선정 (모든 클래스룸 공유)
export async function grantWish(
  teacherId: string,
  classId: string,
  wishId: string,
  message: string
): Promise<void> {
  const wishRef = doc(db, 'teachers', teacherId, 'wishes', wishId);
  await updateDoc(wishRef, {
    isGranted: true,
    grantedMessage: message,
    grantedAt: serverTimestamp()
  });
}

// 소원 삭제 (모든 클래스룸 공유)
export async function deleteWish(
  teacherId: string,
  classId: string,
  wishId: string
): Promise<void> {
  const wishRef = doc(db, 'teachers', teacherId, 'wishes', wishId);
  await deleteDoc(wishRef);
}

// 24시간 지난 선정된 소원 삭제
export async function cleanupExpiredGrantedWishes(teacherId: string): Promise<number> {
  const wishesRef = collection(db, 'teachers', teacherId, 'wishes');
  const snapshot = await getDocs(wishesRef);

  const now = new Date();
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  let deletedCount = 0;

  for (const docSnap of snapshot.docs) {
    const wish = docSnap.data() as Wish;
    if (wish.isGranted && wish.grantedAt) {
      const grantedTime = wish.grantedAt.toDate();
      if (now.getTime() - grantedTime.getTime() > TWENTY_FOUR_HOURS) {
        await deleteDoc(docSnap.ref);
        deletedCount++;
      }
    }
  }

  return deletedCount;
}

// 실시간 소원 구독 (모든 클래스룸 공유)
export function subscribeToWishes(
  teacherId: string,
  classId: string,
  callback: (wishes: Wish[]) => void
): () => void {
  const wishesRef = collection(db, 'teachers', teacherId, 'wishes');
  const q = query(wishesRef, orderBy('createdAt', 'desc'));

  return onSnapshot(q, (snapshot) => {
    const wishes = snapshot.docs.map(doc => doc.data()) as Wish[];
    callback(wishes);
  });
}

// ========================================
// 팀 API
// ========================================

// 팀 저장 (전체 덮어쓰기)
export async function saveTeams(
  teacherId: string,
  classId: string,
  teams: Team[]
): Promise<void> {
  const teamsRef = collection(db, 'teachers', teacherId, 'classes', classId, 'teams');
  
  // 기존 팀 삭제
  const existingTeams = await getDocs(teamsRef);
  for (const teamDoc of existingTeams.docs) {
    await deleteDoc(teamDoc.ref);
  }
  
  // 새 팀 저장
  for (const team of teams) {
    await setDoc(doc(teamsRef, team.teamId), team);
  }
}

// 팀 목록 조회
export async function getTeams(
  teacherId: string,
  classId: string
): Promise<Team[]> {
  const teamsRef = collection(db, 'teachers', teacherId, 'classes', classId, 'teams');
  const snapshot = await getDocs(teamsRef);

  return snapshot.docs.map(doc => doc.data()) as Team[];
}

// 팀 생성
export async function createTeam(
  teacherId: string,
  classId: string,
  teamName: string,
  flag: string
): Promise<string> {
  const teamsRef = collection(db, 'teachers', teacherId, 'classes', classId, 'teams');
  const teamRef = doc(teamsRef);

  await setDoc(teamRef, {
    teamId: teamRef.id,
    teamName,
    flag,
    members: [],
    teamCookie: 0,
    createdAt: serverTimestamp()
  });

  return teamRef.id;
}

// 팀 수정
export async function updateTeam(
  teacherId: string,
  classId: string,
  teamId: string,
  data: Partial<Team>
): Promise<void> {
  const teamRef = doc(db, 'teachers', teacherId, 'classes', classId, 'teams', teamId);
  await updateDoc(teamRef, data);
}

// 팀 삭제
export async function deleteTeam(
  teacherId: string,
  classId: string,
  teamId: string
): Promise<void> {
  const teamRef = doc(db, 'teachers', teacherId, 'classes', classId, 'teams', teamId);
  await deleteDoc(teamRef);
}

// 팀에 멤버 추가
export async function addTeamMember(
  teacherId: string,
  classId: string,
  teamId: string,
  studentCode: string
): Promise<void> {
  const teamRef = doc(db, 'teachers', teacherId, 'classes', classId, 'teams', teamId);
  await updateDoc(teamRef, {
    members: arrayUnion(studentCode)
  });
}

// 팀에서 멤버 제거
export async function removeTeamMember(
  teacherId: string,
  classId: string,
  teamId: string,
  studentCode: string
): Promise<void> {
  const teamRef = doc(db, 'teachers', teacherId, 'classes', classId, 'teams', teamId);
  await updateDoc(teamRef, {
    members: arrayRemove(studentCode)
  });
}

// 팀 쿠키 업데이트
export async function updateTeamCookie(
  teacherId: string,
  classId: string,
  teamId: string,
  cookieChange: number
): Promise<void> {
  const teamRef = doc(db, 'teachers', teacherId, 'classes', classId, 'teams', teamId);
  await updateDoc(teamRef, {
    teamCookie: increment(cookieChange)
  });
}

// ========================================
// 학급 그룹 API (소원 공유용)
// ========================================

// 학급 그룹 저장
export async function saveClassGroup(
  teacherId: string,
  groupId: string,
  name: string,
  classIds: string[]
): Promise<void> {
  const groupRef = doc(db, 'teachers', teacherId, 'classGroups', groupId);
  await setDoc(groupRef, {
    id: groupId,
    name,
    classIds,
    createdAt: serverTimestamp()
  });
}

// 학급 그룹 목록 조회
export async function getClassGroups(
  teacherId: string
): Promise<ClassGroup[]> {
  const groupsRef = collection(db, 'teachers', teacherId, 'classGroups');
  const snapshot = await getDocs(groupsRef);
  return snapshot.docs.map(doc => doc.data()) as ClassGroup[];
}

// 학급 그룹 삭제
export async function deleteClassGroupFromFirestore(
  teacherId: string,
  groupId: string
): Promise<void> {
  const groupRef = doc(db, 'teachers', teacherId, 'classGroups', groupId);
  await deleteDoc(groupRef);
}

// 특정 학급이 속한 그룹 찾기
export async function getGroupForClassFromFirestore(
  teacherId: string,
  classId: string
): Promise<ClassGroup | null> {
  const groups = await getClassGroups(teacherId);
  return groups.find(group => group.classIds.includes(classId)) || null;
}

// 소원 목록 조회 (학급그룹 기준 - 그룹이 있으면 그룹 내 모든 학급, 없으면 본인 학급만)
export async function getWishesByGroup(
  teacherId: string,
  classId: string
): Promise<Wish[]> {
  // 먼저 학급이 속한 그룹 확인
  const group = await getGroupForClassFromFirestore(teacherId, classId);

  const wishesRef = collection(db, 'teachers', teacherId, 'wishes');
  const snapshot = await getDocs(wishesRef);
  const allWishes = snapshot.docs.map(doc => doc.data()) as Wish[];

  // 그룹이 있으면 그룹 내 모든 학급의 소원 반환
  // 그룹이 없으면 해당 학급의 소원만 반환
  const targetClassIds = group ? group.classIds : [classId];

  const filteredWishes = allWishes.filter(wish =>
    targetClassIds.includes((wish as any).classId)
  );

  // 최신순 정렬
  return filteredWishes.sort((a, b) => {
    const timeA = a.createdAt?.toMillis?.() || new Date(a.createdAt as any).getTime();
    const timeB = b.createdAt?.toMillis?.() || new Date(b.createdAt as any).getTime();
    return timeB - timeA;
  });
}

// ========================================
// 상점 API
// ========================================

// 상점 아이템 목록 조회 (공용)
export async function getShopItems(): Promise<ShopItem[]> {
  const itemsRef = collection(db, 'shop');
  const snapshot = await getDocs(itemsRef);
  
  return snapshot.docs.map(doc => ({
    code: doc.id,
    ...doc.data()
  })) as ShopItem[];
}

// 아이템 구매 (캔디 사용)
export async function purchaseItem(
  teacherId: string,
  studentCode: string,
  itemCode: string,
  price: number
): Promise<void> {
  const studentRef = doc(db, 'teachers', teacherId, 'students', studentCode);

  await updateDoc(studentRef, {
    jelly: increment(-price),  // 캔디로 구매
    ownedItems: arrayUnion(itemCode),
    lastUpdate: serverTimestamp()
  });
}

// 칭호권 활성화
export async function activateTitlePermit(
  teacherId: string,
  studentCode: string
): Promise<void> {
  const studentRef = doc(db, 'teachers', teacherId, 'students', studentCode);

  await updateDoc(studentRef, {
    'profile.titlePermitActive': true,
    lastUpdate: serverTimestamp()
  });
}

// 프로필사진권 활성화
export async function activateProfilePhoto(
  teacherId: string,
  studentCode: string
): Promise<void> {
  const studentRef = doc(db, 'teachers', teacherId, 'students', studentCode);

  await updateDoc(studentRef, {
    'profile.profilePhotoActive': true,
    lastUpdate: serverTimestamp()
  });
}

// 선생님별 상점 아이템 조회
export async function getTeacherShopItems(teacherId: string): Promise<ShopItem[]> {
  const itemsRef = collection(db, 'teachers', teacherId, 'shop');
  const snapshot = await getDocs(itemsRef);

  return snapshot.docs.map(doc => ({
    code: doc.id,
    ...doc.data()
  })) as ShopItem[];
}

// 상점 아이템 추가
export async function addShopItem(
  teacherId: string,
  item: Omit<ShopItem, 'code'> & { code?: string }
): Promise<string> {
  const itemsRef = collection(db, 'teachers', teacherId, 'shop');

  // 코드가 제공되면 해당 코드 사용, 아니면 자동 생성
  const itemCode = item.code || doc(itemsRef).id;
  const itemRef = doc(itemsRef, itemCode);

  const itemData: any = {
    code: itemCode,
    name: item.name,
    price: item.price,
    category: item.category,
    description: item.description,
    value: item.value
  };

  // maxCount가 있으면 추가 (스트릭 프리즈용)
  if (item.maxCount !== undefined) {
    itemData.maxCount = item.maxCount;
  }

  await setDoc(itemRef, itemData);

  return itemCode;
}

// 상점 아이템 수정
export async function updateShopItem(
  teacherId: string,
  itemCode: string,
  data: Partial<ShopItem>
): Promise<void> {
  const itemRef = doc(db, 'teachers', teacherId, 'shop', itemCode);
  await updateDoc(itemRef, data);
}

// 상점 아이템 삭제
export async function deleteShopItem(
  teacherId: string,
  itemCode: string
): Promise<void> {
  const itemRef = doc(db, 'teachers', teacherId, 'shop', itemCode);
  await deleteDoc(itemRef);
}

// 상점 아이템 전체 삭제
export async function deleteAllShopItems(teacherId: string): Promise<number> {
  const shopRef = collection(db, 'teachers', teacherId, 'shop');
  const shopSnap = await getDocs(shopRef);

  let deletedCount = 0;
  for (const itemDoc of shopSnap.docs) {
    await deleteDoc(itemDoc.ref);
    deletedCount++;
  }

  return deletedCount;
}

// ========================================
// 프로필 API
// ========================================

// 프로필 저장
export async function saveProfile(
  teacherId: string,
  studentCode: string,
  profile: Partial<Student['profile']>
): Promise<void> {
  const studentRef = doc(db, 'teachers', teacherId, 'students', studentCode);
  
  const updateData: Record<string, unknown> = {
    lastUpdate: serverTimestamp()
  };
  
  for (const [key, value] of Object.entries(profile)) {
    if (value !== undefined) {
      updateData[`profile.${key}`] = value;
    }
  }
  
  await updateDoc(studentRef, updateData);
}

// ========================================
// 잔디(Grass) API
// ========================================

// 한국 시간 기준 날짜 문자열 생성 (YYYY-MM-DD)
function getKoreanDateString(date: Date): string {
  // 한국 시간대(UTC+9)로 변환
  const koreaTime = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const year = koreaTime.getFullYear();
  const month = String(koreaTime.getMonth() + 1).padStart(2, '0');
  const day = String(koreaTime.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 잔디 기록 추가 (주말은 금요일로 반영, 한국 시간 기준)
export async function addGrassRecord(
  teacherId: string,
  classId: string,
  studentCode: string,
  cookieChange: number
): Promise<void> {
  const now = new Date();
  const koreaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const dayOfWeek = koreaTime.getDay();

  if (dayOfWeek === 0) {
    koreaTime.setDate(koreaTime.getDate() - 2);
  } else if (dayOfWeek === 6) {
    koreaTime.setDate(koreaTime.getDate() - 1);
  }

  const year = koreaTime.getFullYear();
  const month = String(koreaTime.getMonth() + 1).padStart(2, '0');
  const day = String(koreaTime.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  const grassRef = doc(db, 'teachers', teacherId, 'classes', classId, 'grass', dateStr);
  
  const grassSnap = await getDoc(grassRef);
  
  if (grassSnap.exists()) {
    const records = grassSnap.data().records || {};
    const currentData = records[studentCode] || { change: 0, count: 0 };
    
    await updateDoc(grassRef, {
      [`records.${studentCode}`]: {
        change: currentData.change + cookieChange,
        count: currentData.count + 1
      }
    });
  } else {
    await setDoc(grassRef, {
      date: new Date(koreaTime),
      records: {
        [studentCode]: { change: cookieChange, count: 1 }
      }
    }, { merge: true });
  }
}

// 잔디 데이터 조회
export async function getGrassData(
  teacherId: string,
  classId: string,
  studentCode?: string
): Promise<Array<{ date: string; studentCode: string; cookieChange: number; count: number; usedStreakFreeze?: boolean }>> {
  const grassRef = collection(db, 'teachers', teacherId, 'classes', classId, 'grass');
  const snapshot = await getDocs(grassRef);

  const grassData: Array<{ date: string; studentCode: string; cookieChange: number; count: number; usedStreakFreeze?: boolean }> = [];

  snapshot.docs.forEach(doc => {
    const date = doc.id;
    const records = doc.data().records || {};

    for (const [code, data] of Object.entries(records)) {
      if (!studentCode || code === studentCode) {
        const record = data as { change: number; count: number; usedStreakFreeze?: boolean };
        grassData.push({
          date,
          studentCode: code,
          cookieChange: record.change,
          count: record.count,
          usedStreakFreeze: record.usedStreakFreeze
        });
      }
    }
  });

  return grassData;
}

// 잔디 데이터 초기화 (전체 삭제)
export async function resetGrassData(
  teacherId: string,
  classId: string
): Promise<{ success: boolean; deletedCount: number }> {
  const grassRef = collection(db, 'teachers', teacherId, 'classes', classId, 'grass');
  const snapshot = await getDocs(grassRef);

  let deletedCount = 0;
  for (const docSnap of snapshot.docs) {
    await deleteDoc(doc(db, 'teachers', teacherId, 'classes', classId, 'grass', docSnap.id));
    deletedCount++;
  }

  return { success: true, deletedCount };
}

// 특정 날짜에 잔디 기록 추가 (과거 소급용)
export async function addGrassRecordForDate(
  teacherId: string,
  classId: string,
  studentCode: string,
  dateStr: string, // YYYY-MM-DD 형식
  cookieChange: number
): Promise<void> {
  const grassRef = doc(db, 'teachers', teacherId, 'classes', classId, 'grass', dateStr);

  const grassSnap = await getDoc(grassRef);

  if (grassSnap.exists()) {
    const records = grassSnap.data().records || {};
    const currentData = records[studentCode] || { change: 0, count: 0 };

    await updateDoc(grassRef, {
      [`records.${studentCode}`]: {
        change: currentData.change + cookieChange,
        count: currentData.count + 1
      }
    });
  } else {
    await setDoc(grassRef, {
      date: new Date(dateStr),
      records: {
        [studentCode]: { change: cookieChange, count: 1 }
      }
    }, { merge: true });  // merge 옵션으로 기존 데이터 보존
  }
}

// 잔디 날짜 재배치 (date Timestamp를 한국 시간으로 변환하여 올바른 날짜로 이동)
export async function migrateGrassDateToToday(
  teacherId: string,
  classId: string
): Promise<{ success: boolean; migratedCount: number }> {
  const grassRef = collection(db, 'teachers', teacherId, 'classes', classId, 'grass');
  const snapshot = await getDocs(grassRef);

  let migratedCount = 0;

  for (const docSnap of snapshot.docs) {
    const docId = docSnap.id; // 현재 문서 ID (날짜 문자열)
    const data = docSnap.data();
    const dateTimestamp = data.date;

    if (!dateTimestamp || !dateTimestamp.toDate) continue;

    // Timestamp를 한국 시간 날짜 문자열로 변환
    const actualDate = dateTimestamp.toDate();
    const correctDateStr = getKoreanDateString(actualDate);

    // 문서 ID와 실제 날짜가 다르면 재배치
    if (docId !== correctDateStr) {
      const records = data.records || {};
      const correctRef = doc(db, 'teachers', teacherId, 'classes', classId, 'grass', correctDateStr);
      const correctSnap = await getDoc(correctRef);

      if (correctSnap.exists()) {
        // 올바른 날짜에 이미 기록이 있으면 병합
        const existingRecords = correctSnap.data().records || {};
        for (const [studentCode, recordData] of Object.entries(records)) {
          const record = recordData as { change: number; count: number };
          const existing = existingRecords[studentCode] || { change: 0, count: 0 };
          existingRecords[studentCode] = {
            change: existing.change + record.change,
            count: existing.count + record.count
          };
        }
        await updateDoc(correctRef, { records: existingRecords });
      } else {
        // 올바른 날짜에 기록이 없으면 새로 생성
        await setDoc(correctRef, {
          date: actualDate,
          records: records
        });
      }

      // 잘못된 날짜의 문서 삭제
      await deleteDoc(doc(db, 'teachers', teacherId, 'classes', classId, 'grass', docId));
      migratedCount++;
    }
  }

  return { success: migratedCount > 0, migratedCount };
}

// ========================================
// 다했니 API 연동
// ========================================

// 다했니 API에서 학급 목록 가져오기
export async function fetchClassroomsFromDahandin(apiKey: string): Promise<Array<{
  name: string;
  totalCookies: number;
  cookies: number;
  usedCookies: number;
}>> {
  const response = await fetch(
    'https://api.dahandin.com/openapi/v1/get/class/list',
    {
      headers: { 'X-API-Key': apiKey }
    }
  );

  if (!response.ok) {
    throw new Error(`API 요청 실패: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.result && data.data) {
    return data.data;
  }

  throw new Error(data.message || '학급 목록을 가져올 수 없습니다.');
}

// 다했니 API에서 학생 정보 가져오기
export async function fetchStudentFromDahandin(
  apiKey: string,
  studentCode: string
): Promise<{
  cookie: number;
  usedCookie: number;
  totalCookie: number;
  chocoChips: number;
  badges: Record<string, Badge>;
}> {
  const response = await fetch(
    `https://api.dahandin.com/openapi/v1/get/student/total?code=${studentCode}`,
    {
      headers: { 'X-API-Key': apiKey }
    }
  );

  if (!response.ok) {
    throw new Error(`API 요청 실패: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.result && data.data) {
    return {
      cookie: data.data.cookie || 0,
      usedCookie: data.data.usedCookie || 0,
      totalCookie: data.data.totalCookie || 0,
      chocoChips: data.data.chocoChips || 0,
      badges: data.data.badges || {}
    };
  }

  throw new Error(data.message || '학생 정보를 가져올 수 없습니다.');
}

// 마지막 새로고침 시간 확인
export async function getLastRefreshTime(
  teacherId: string,
  classId: string
): Promise<Date | null> {
  const classRef = doc(db, 'teachers', teacherId, 'classes', classId);
  const classSnap = await getDoc(classRef);

  if (classSnap.exists()) {
    const data = classSnap.data();
    return data.lastCookieRefresh?.toDate?.() || null;
  }
  return null;
}

// 새로고침 가능 여부 확인 (4시간 경과 여부)
export async function canRefreshCookies(
  teacherId: string,
  classId: string
): Promise<{ canRefresh: boolean; remainingMinutes: number }> {
  const lastRefresh = await getLastRefreshTime(teacherId, classId);

  if (!lastRefresh) {
    return { canRefresh: true, remainingMinutes: 0 };
  }

  const now = new Date();
  const timeSinceRefresh = now.getTime() - lastRefresh.getTime();
  const remainingMs = REFRESH_INTERVAL_MS - timeSinceRefresh;

  if (remainingMs <= 0) {
    return { canRefresh: true, remainingMinutes: 0 };
  }

  return {
    canRefresh: false,
    remainingMinutes: Math.ceil(remainingMs / (60 * 1000))
  };
}

// 쿠키 새로고침 (다했니 API에서 가져와서 Firestore에 저장)
// 잔디는 쿠키가 증가할 때마다 바로 기록 (첫 등록 제외)
// 캔디는 쿠키 증가분만큼 추가 (감소는 무시)
export async function refreshStudentCookies(
  teacherId: string,
  classId: string,
  apiKey: string
): Promise<{ success: boolean; count: number; error?: string }> {
  const students = await getClassStudents(teacherId, classId);
  let updatedCount = 0;

  for (const student of students) {
    try {
      const dahandinData = await fetchStudentFromDahandin(apiKey, student.code);

      // 첫 로드인지 확인:
      // 1. initialCookie가 없거나 0이면 첫 등록 후 첫 동기화
      // 2. previousCookie가 없거나 0이면 이전 버전 데이터
      const hasInitialCookie = student.initialCookie !== undefined && student.initialCookie > 0;
      const hasPreviousCookie = student.previousCookie !== undefined && student.previousCookie > 0;
      const isFirstLoad = !hasInitialCookie && !hasPreviousCookie;

      // previousCookie가 없으면 현재 저장된 cookie 값을 사용 (첫 새로고침 시 잘못된 증가분 방지)
      const effectivePreviousCookie = student.previousCookie ?? student.cookie ?? dahandinData.cookie;

      // 쿠키 변화량 계산 (effectivePreviousCookie 기준)
      const cookieChange = dahandinData.cookie - effectivePreviousCookie;

      // 캔디 마이그레이션: jelly가 없으면 현재 cookie 값으로 초기화
      const currentJelly = student.jelly ?? student.cookie ?? 0;
      const currentLastSyncedCookie = student.lastSyncedCookie ?? student.cookie ?? 0;

      // 캔디 증가량 계산 (lastSyncedCookie 기준, 증가분만)
      const jellyIncrease = Math.max(0, dahandinData.cookie - currentLastSyncedCookie);

      // 학생 정보 업데이트 (뱃지 포함)
      const updateData: Partial<Student> = {
        cookie: dahandinData.cookie,
        jelly: currentJelly + jellyIncrease,  // 증가분만 캔디에 추가
        lastSyncedCookie: dahandinData.cookie, // 동기화 시점 기록
        usedCookie: dahandinData.usedCookie,
        totalCookie: dahandinData.totalCookie,
        chocoChips: dahandinData.chocoChips,
        previousCookie: dahandinData.cookie,
        badges: dahandinData.badges
      };

      // 첫 로드면 initialCookie 설정
      if (isFirstLoad) {
        updateData.initialCookie = dahandinData.cookie;
      }

      await updateStudent(teacherId, student.code, updateData);

      // 잔디 기록 (쿠키가 증가했을 때만, 첫 로드는 제외)
      // 4시간 제한 제거 - 쿠키가 증가하면 바로 기록
      if (cookieChange > 0 && !isFirstLoad) {
        await addGrassRecord(teacherId, classId, student.code, cookieChange);
        // 스트릭 프리즈 자동 사용
        await autoUseStreakFreezes(teacherId, classId, student.code);
      }

      updatedCount++;
    } catch (error) {
      console.error(`Failed to refresh ${student.code}:`, error);
    }
  }

  // 새로고침 시간 항상 업데이트
  const classRef = doc(db, 'teachers', teacherId, 'classes', classId);
  await updateDoc(classRef, {
    lastCookieRefresh: serverTimestamp()
  });

  return { success: true, count: updatedCount };
}

// ========================================
// 배틀 API
// ========================================

// 배틀 정보
export interface Battle {
  id: string;
  title: string;
  description: string;
  team1Id: string;
  team2Id: string;
  team1Score: number;
  team2Score: number;
  status: 'pending' | 'ongoing' | 'completed';
  winnerId: string | null;
  reward: number;
  createdAt: Timestamp;
  endedAt: Timestamp | null;
}

// 배틀 생성
export async function createBattle(
  teacherId: string,
  classId: string,
  title: string,
  description: string,
  team1Id: string,
  team2Id: string,
  reward: number
): Promise<string> {
  const battlesRef = collection(db, 'teachers', teacherId, 'classes', classId, 'battles');
  const battleRef = doc(battlesRef);

  await setDoc(battleRef, {
    id: battleRef.id,
    title,
    description,
    team1Id,
    team2Id,
    team1Score: 0,
    team2Score: 0,
    status: 'ongoing',
    winnerId: null,
    reward,
    createdAt: serverTimestamp(),
    endedAt: null
  });

  return battleRef.id;
}

// 배틀 목록 조회
export async function getBattles(
  teacherId: string,
  classId: string
): Promise<Battle[]> {
  const battlesRef = collection(db, 'teachers', teacherId, 'classes', classId, 'battles');
  const q = query(battlesRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => doc.data()) as Battle[];
}

// 배틀 점수 업데이트
export async function updateBattleScore(
  teacherId: string,
  classId: string,
  battleId: string,
  team1Score: number,
  team2Score: number
): Promise<void> {
  const battleRef = doc(db, 'teachers', teacherId, 'classes', classId, 'battles', battleId);
  await updateDoc(battleRef, {
    team1Score,
    team2Score
  });
}

// 배틀 종료
export async function endBattle(
  teacherId: string,
  classId: string,
  battleId: string,
  winnerId: string | null
): Promise<void> {
  const battleRef = doc(db, 'teachers', teacherId, 'classes', classId, 'battles', battleId);
  await updateDoc(battleRef, {
    status: 'completed',
    winnerId,
    endedAt: serverTimestamp()
  });
}

// 배틀 삭제
export async function deleteBattle(
  teacherId: string,
  classId: string,
  battleId: string
): Promise<void> {
  const battleRef = doc(db, 'teachers', teacherId, 'classes', classId, 'battles', battleId);
  await deleteDoc(battleRef);
}

// ========================================
// 추가 타입 및 호환 API
// ========================================

// CSV 및 기존 코드 호환용 타입
export interface StoredStudent {
  number: number;
  name: string;
  code: string;
}

// 랭킹용 학생 타입
export interface RankedStudent extends Student {
  rank: number;
}

// 쿠키 랭킹 조회
export async function getCookieRanking(
  teacherId: string,
  classId: string
): Promise<RankedStudent[]> {
  const students = await getClassStudents(teacherId, classId);

  // 쿠키 순으로 정렬
  const sorted = [...students].sort((a, b) => b.cookie - a.cookie);

  // 순위 부여 (동점자 처리)
  let currentRank = 1;
  let previousCookie = -1;

  return sorted.map((student, idx) => {
    if (student.cookie !== previousCookie) {
      currentRank = idx + 1;
    }
    previousCookie = student.cookie;

    return {
      ...student,
      rank: currentRank
    };
  });
}

// 오늘 잔디 여부 확인
export async function checkTodayGrass(
  teacherId: string,
  classId: string,
  studentCode: string
): Promise<boolean> {
  const today = getKoreanDateString(new Date());
  const grassRef = doc(db, 'teachers', teacherId, 'classes', classId, 'grass', today);
  const grassSnap = await getDoc(grassRef);

  if (!grassSnap.exists()) {
    return false;
  }

  const records = grassSnap.data().records || {};
  return !!records[studentCode];
}

// 잔디 추가 (미션 완료용)
export async function addGrass(
  teacherId: string,
  classId: string,
  studentCode: string,
  count: number = 1
): Promise<{ success: boolean; message?: string }> {
  try {
    await addGrassRecord(teacherId, classId, studentCode, count);
    return { success: true };
  } catch (error) {
    console.error('Failed to add grass:', error);
    return { success: false, message: '잔디 추가에 실패했습니다.' };
  }
}

// 잔디 데이터 조회 (날짜 배열 형태)
export async function getGrass(
  teacherId: string,
  classId: string,
  studentCode: string
): Promise<Array<{ date: string; count: number }>> {
  const grassData = await getGrassData(teacherId, classId, studentCode);

  return grassData.map(g => ({
    date: g.date,
    count: g.count
  }));
}

// 학생 정보 조회 (다했니 API 호환)
export interface StudentInfo {
  name: string;
  cookie: number;
  usedCookie: number;
  totalCookie: number;
  badges: Record<string, { hasBadge: boolean; imgUrl: string; title: string }>;
}

// 여러 학생 정보 조회 (다했니 API)
export async function getMultipleStudentsInfo(
  apiKey: string,
  codes: string[],
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, StudentInfo | null>> {
  const results = new Map<string, StudentInfo | null>();

  for (let i = 0; i < codes.length; i++) {
    try {
      const response = await fetch(
        `https://api.dahandin.com/openapi/v1/get/student/total?code=${codes[i]}`,
        { headers: { 'X-API-Key': apiKey } }
      );
      const data = await response.json();

      if (data.result && data.data) {
        results.set(codes[i], {
          name: data.data.name || '',
          cookie: data.data.cookie || 0,
          usedCookie: data.data.usedCookie || 0,
          totalCookie: data.data.totalCookie || 0,
          badges: data.data.badges || {}
        });
      } else {
        results.set(codes[i], null);
      }
    } catch {
      results.set(codes[i], null);
    }

    onProgress?.(i + 1, codes.length);
  }

  return results;
}

// ========================================
// 쿠키 상점 API (실물 교환)
// ========================================

// 쿠키 상점 아이템 목록 조회 (전체 클래스 공유)
export async function getCookieShopItems(
  teacherId: string
): Promise<CookieShopItem[]> {
  const itemsRef = collection(db, 'teachers', teacherId, 'cookieShopItems');
  const snapshot = await getDocs(query(itemsRef, orderBy('createdAt', 'desc')));
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as CookieShopItem[];
}

// 쿠키 상점 아이템 추가 (전체 클래스 공유)
export async function addCookieShopItem(
  teacherId: string,
  item: Omit<CookieShopItem, 'id' | 'createdAt'>
): Promise<string> {
  const itemsRef = collection(db, 'teachers', teacherId, 'cookieShopItems');
  const newDoc = doc(itemsRef);
  await setDoc(newDoc, {
    ...item,
    createdAt: serverTimestamp()
  });
  return newDoc.id;
}

// 쿠키 상점 아이템 수정 (전체 클래스 공유)
export async function updateCookieShopItem(
  teacherId: string,
  itemId: string,
  updates: Partial<Omit<CookieShopItem, 'id' | 'createdAt'>>
): Promise<void> {
  const itemRef = doc(db, 'teachers', teacherId, 'cookieShopItems', itemId);
  await updateDoc(itemRef, updates);
}

// 쿠키 상점 아이템 삭제 (전체 클래스 공유)
export async function deleteCookieShopItem(
  teacherId: string,
  itemId: string
): Promise<void> {
  const itemRef = doc(db, 'teachers', teacherId, 'cookieShopItems', itemId);
  await deleteDoc(itemRef);
}

// 쿠키 상점 신청 생성 (학생용 - 전체 클래스 공유)
export async function createCookieShopRequest(
  teacherId: string,
  request: Omit<CookieShopRequest, 'id' | 'createdAt' | 'status'>
): Promise<string> {
  const requestsRef = collection(db, 'teachers', teacherId, 'cookieShopRequests');
  const newDoc = doc(requestsRef);
  await setDoc(newDoc, {
    ...request,
    status: 'pending',
    createdAt: serverTimestamp()
  });
  return newDoc.id;
}

// 쿠키 상점 신청 목록 조회 (교사용 - 전체 클래스 공유)
export async function getCookieShopRequests(
  teacherId: string,
  statusFilter?: 'pending' | 'approved' | 'rejected' | 'completed'
): Promise<CookieShopRequest[]> {
  const requestsRef = collection(db, 'teachers', teacherId, 'cookieShopRequests');
  let q;
  if (statusFilter) {
    // 인덱스 오류 방지를 위해 클라이언트 측 정렬
    q = query(requestsRef, where('status', '==', statusFilter));
  } else {
    q = query(requestsRef, orderBy('createdAt', 'desc'));
  }
  const snapshot = await getDocs(q);
  const requests = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as CookieShopRequest[];
  // statusFilter 있을 때 클라이언트 측 정렬
  if (statusFilter) {
    return requests.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
  }
  return requests;
}

// 쿠키 상점 신청 목록 조회 (학생용 - 본인 것만)
export async function getStudentCookieShopRequests(
  teacherId: string,
  studentCode: string
): Promise<CookieShopRequest[]> {
  const requestsRef = collection(db, 'teachers', teacherId, 'cookieShopRequests');
  // 인덱스 오류 방지를 위해 클라이언트 측 정렬
  const q = query(requestsRef, where('studentCode', '==', studentCode));
  const snapshot = await getDocs(q);
  const requests = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as CookieShopRequest[];
  // 최신순 정렬 (클라이언트 측)
  return requests.sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() || 0;
    const bTime = b.createdAt?.toMillis?.() || 0;
    return bTime - aTime;
  });
}

// 쿠키 상점 신청 상태 업데이트 (교사용 - 전체 클래스 공유)
export async function updateCookieShopRequestStatus(
  teacherId: string,
  requestId: string,
  status: 'approved' | 'rejected' | 'completed',
  teacherResponse?: string
): Promise<void> {
  const requestRef = doc(db, 'teachers', teacherId, 'cookieShopRequests', requestId);
  await updateDoc(requestRef, {
    status,
    teacherResponse: teacherResponse || '',
    updatedAt: serverTimestamp()
  });
}

// 대기 중인 신청 개수 조회 (교사용 - 전체 클래스 공유)
export async function getPendingCookieShopRequestsCount(
  teacherId: string
): Promise<number> {
  const requestsRef = collection(db, 'teachers', teacherId, 'cookieShopRequests');
  const q = query(requestsRef, where('status', '==', 'pending'));
  const snapshot = await getDocs(q);
  return snapshot.size;
}

// 쿠키 상점 신청 삭제 (전체 클래스 공유)
export async function deleteCookieShopRequest(
  teacherId: string,
  requestId: string
): Promise<void> {
  const requestRef = doc(db, 'teachers', teacherId, 'cookieShopRequests', requestId);
  await deleteDoc(requestRef);
}

// ========== 상점 물품 요청 (학생 → 교사) ==========

// 물품 요청 타입
export interface ItemSuggestion {
  id: string;
  studentCode: string;
  studentName: string;
  classId: string;
  className?: string;
  itemName: string;
  description?: string;
  createdAt: Timestamp;
  status: 'pending' | 'approved' | 'rejected';
  teacherMessage?: string;
  updatedAt?: Timestamp;
}

// 물품 요청 생성 (학생용)
export async function createItemSuggestion(
  teacherId: string,
  suggestion: Omit<ItemSuggestion, 'id' | 'createdAt' | 'status'>
): Promise<string> {
  const suggestionsRef = collection(db, 'teachers', teacherId, 'itemSuggestions');
  const newDoc = doc(suggestionsRef);
  await setDoc(newDoc, {
    ...suggestion,
    status: 'pending',
    createdAt: serverTimestamp()
  });
  return newDoc.id;
}

// 물품 요청 목록 조회 (교사용)
export async function getItemSuggestions(
  teacherId: string
): Promise<ItemSuggestion[]> {
  const suggestionsRef = collection(db, 'teachers', teacherId, 'itemSuggestions');
  const snapshot = await getDocs(suggestionsRef);
  const suggestions = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as ItemSuggestion[];

  // 클라이언트 측 정렬 (최신순)
  return suggestions.sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() || 0;
    const bTime = b.createdAt?.toMillis?.() || 0;
    return bTime - aTime;
  });
}

// 물품 요청 상태 업데이트 (교사용)
export async function updateItemSuggestionStatus(
  teacherId: string,
  suggestionId: string,
  status: 'pending' | 'approved' | 'rejected',
  teacherMessage?: string
): Promise<void> {
  const suggestionRef = doc(db, 'teachers', teacherId, 'itemSuggestions', suggestionId);
  const updateData: any = {
    status,
    updatedAt: serverTimestamp()
  };
  if (teacherMessage) {
    updateData.teacherMessage = teacherMessage;
  }
  await updateDoc(suggestionRef, updateData);
}

// 학생용 물품 요청 목록 조회
export async function getStudentItemSuggestions(
  teacherId: string,
  studentCode: string
): Promise<ItemSuggestion[]> {
  const suggestionsRef = collection(db, 'teachers', teacherId, 'itemSuggestions');
  const q = query(suggestionsRef, where('studentCode', '==', studentCode));
  const snapshot = await getDocs(q);
  const suggestions = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as ItemSuggestion[];

  return suggestions.sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() || 0;
    const bTime = b.createdAt?.toMillis?.() || 0;
    return bTime - aTime;
  });
}

// 물품 요청 삭제 (교사용)
export async function deleteItemSuggestion(
  teacherId: string,
  suggestionId: string
): Promise<void> {
  const suggestionRef = doc(db, 'teachers', teacherId, 'itemSuggestions', suggestionId);
  await deleteDoc(suggestionRef);
}

// 대기 중인 물품 요청 개수 조회
export async function getPendingItemSuggestionsCount(
  teacherId: string
): Promise<number> {
  const suggestionsRef = collection(db, 'teachers', teacherId, 'itemSuggestions');
  const q = query(suggestionsRef, where('status', '==', 'pending'));
  const snapshot = await getDocs(q);
  return snapshot.size;
}

// ========================================
// 워드클라우드 API
// ========================================

// 워드클라우드 세션
export interface WordCloudSession {
  id: string;
  title: string;
  createdAt: Timestamp;
  status: 'active' | 'ended';
  maxSubmissions: number | null; // null이면 무제한
  totalResponses: number;
}

// 학생이 제출한 단어
export interface WordCloudWord {
  id: string;
  word: string;
  timestamp: Timestamp;
}

// 학생 응답
export interface WordCloudResponse {
  studentCode: string;
  studentName: string;
  words: WordCloudWord[];
  lastUpdate: Timestamp;
}

// 워드클라우드 집계 데이터
export interface WordCloudData {
  word: string;
  count: number;
  students: string[]; // 제출한 학생 코드 목록
}

// 워드클라우드 세션 생성
export async function createWordCloudSession(
  teacherId: string,
  classId: string,
  title: string,
  maxSubmissions: number | null
): Promise<string> {
  const sessionsRef = collection(db, 'teachers', teacherId, 'classes', classId, 'wordclouds');
  const sessionRef = doc(sessionsRef);

  await setDoc(sessionRef, {
    id: sessionRef.id,
    title,
    createdAt: serverTimestamp(),
    status: 'active',
    maxSubmissions,
    totalResponses: 0
  });

  return sessionRef.id;
}

// 워드클라우드 세션 목록 조회
export async function getWordCloudSessions(
  teacherId: string,
  classId: string
): Promise<WordCloudSession[]> {
  const sessionsRef = collection(db, 'teachers', teacherId, 'classes', classId, 'wordclouds');
  const q = query(sessionsRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => doc.data()) as WordCloudSession[];
}

// 워드클라우드 세션 상태 변경
export async function updateWordCloudSessionStatus(
  teacherId: string,
  classId: string,
  sessionId: string,
  status: 'active' | 'ended'
): Promise<void> {
  const sessionRef = doc(db, 'teachers', teacherId, 'classes', classId, 'wordclouds', sessionId);
  await updateDoc(sessionRef, { status });
}

// 워드클라우드 세션 삭제
export async function deleteWordCloudSession(
  teacherId: string,
  classId: string,
  sessionId: string
): Promise<void> {
  const sessionRef = doc(db, 'teachers', teacherId, 'classes', classId, 'wordclouds', sessionId);

  // 모든 응답 삭제
  const responsesRef = collection(db, 'teachers', teacherId, 'classes', classId, 'wordclouds', sessionId, 'responses');
  const responsesSnapshot = await getDocs(responsesRef);

  for (const responseDoc of responsesSnapshot.docs) {
    await deleteDoc(responseDoc.ref);
  }

  // 세션 삭제
  await deleteDoc(sessionRef);
}

// 단어 제출 (학생)
export async function submitWordToCloud(
  teacherId: string,
  classId: string,
  sessionId: string,
  studentCode: string,
  studentName: string,
  word: string
): Promise<{ success: boolean; error?: string }> {
  const trimmedWord = word.trim();

  if (!trimmedWord) {
    return { success: false, error: '단어를 입력해주세요.' };
  }

  // 세션 확인
  const sessionRef = doc(db, 'teachers', teacherId, 'classes', classId, 'wordclouds', sessionId);
  const sessionSnap = await getDoc(sessionRef);

  if (!sessionSnap.exists()) {
    return { success: false, error: '세션을 찾을 수 없습니다.' };
  }

  const session = sessionSnap.data() as WordCloudSession;

  if (session.status !== 'active') {
    return { success: false, error: '종료된 세션입니다.' };
  }

  // 학생 응답 확인
  const responseRef = doc(db, 'teachers', teacherId, 'classes', classId, 'wordclouds', sessionId, 'responses', studentCode);
  const responseSnap = await getDoc(responseRef);

  let words: WordCloudWord[] = [];

  if (responseSnap.exists()) {
    const response = responseSnap.data() as WordCloudResponse;
    words = response.words || [];

    // 제출 횟수 제한 확인 (같은 단어 여러번 제출 허용)
    if (session.maxSubmissions !== null && words.length >= session.maxSubmissions) {
      return { success: false, error: `최대 ${session.maxSubmissions}개까지 제출할 수 있습니다.` };
    }
  }

  // 새 단어 추가
  const newWord: WordCloudWord = {
    id: doc(collection(db, 'temp')).id,
    word: trimmedWord,
    timestamp: Timestamp.now()
  };

  words.push(newWord);

  await setDoc(responseRef, {
    studentCode,
    studentName,
    words,
    lastUpdate: serverTimestamp()
  });

  // 총 응답 수 업데이트
  await updateDoc(sessionRef, {
    totalResponses: increment(1)
  });

  return { success: true };
}

// 단어 수정
export async function updateWordInCloud(
  teacherId: string,
  classId: string,
  sessionId: string,
  studentCode: string,
  wordId: string,
  newWord: string
): Promise<{ success: boolean; error?: string }> {
  const trimmedWord = newWord.trim();

  if (!trimmedWord) {
    return { success: false, error: '단어를 입력해주세요.' };
  }

  const responseRef = doc(db, 'teachers', teacherId, 'classes', classId, 'wordclouds', sessionId, 'responses', studentCode);
  const responseSnap = await getDoc(responseRef);

  if (!responseSnap.exists()) {
    return { success: false, error: '응답을 찾을 수 없습니다.' };
  }

  const response = responseSnap.data() as WordCloudResponse;
  const words = response.words || [];

  const wordIndex = words.findIndex(w => w.id === wordId);

  if (wordIndex === -1) {
    return { success: false, error: '단어를 찾을 수 없습니다.' };
  }

  words[wordIndex] = {
    ...words[wordIndex],
    word: trimmedWord,
    timestamp: Timestamp.now()
  };

  await updateDoc(responseRef, {
    words,
    lastUpdate: serverTimestamp()
  });

  return { success: true };
}

// 단어 삭제
export async function deleteWordFromCloud(
  teacherId: string,
  classId: string,
  sessionId: string,
  studentCode: string,
  wordId: string
): Promise<void> {
  const responseRef = doc(db, 'teachers', teacherId, 'classes', classId, 'wordclouds', sessionId, 'responses', studentCode);
  const responseSnap = await getDoc(responseRef);

  if (!responseSnap.exists()) return;

  const response = responseSnap.data() as WordCloudResponse;
  const words = response.words || [];

  const filteredWords = words.filter(w => w.id !== wordId);

  if (filteredWords.length === 0) {
    // 모든 단어가 삭제되면 응답 문서도 삭제
    await deleteDoc(responseRef);
  } else {
    await updateDoc(responseRef, {
      words: filteredWords,
      lastUpdate: serverTimestamp()
    });
  }

  // 총 응답 수 업데이트
  const sessionRef = doc(db, 'teachers', teacherId, 'classes', classId, 'wordclouds', sessionId);
  await updateDoc(sessionRef, {
    totalResponses: increment(-1)
  });
}

// 학생이 제출한 단어 목록 조회
export async function getStudentWords(
  teacherId: string,
  classId: string,
  sessionId: string,
  studentCode: string
): Promise<WordCloudWord[]> {
  const responseRef = doc(db, 'teachers', teacherId, 'classes', classId, 'wordclouds', sessionId, 'responses', studentCode);
  const responseSnap = await getDoc(responseRef);

  if (!responseSnap.exists()) return [];

  const response = responseSnap.data() as WordCloudResponse;
  return response.words || [];
}

// 모든 응답 조회
export async function getAllWordCloudResponses(
  teacherId: string,
  classId: string,
  sessionId: string
): Promise<WordCloudResponse[]> {
  const responsesRef = collection(db, 'teachers', teacherId, 'classes', classId, 'wordclouds', sessionId, 'responses');
  const snapshot = await getDocs(responsesRef);

  return snapshot.docs.map(doc => doc.data()) as WordCloudResponse[];
}

// 워드클라우드 집계 데이터 조회
export async function getWordCloudData(
  teacherId: string,
  classId: string,
  sessionId: string
): Promise<WordCloudData[]> {
  const responses = await getAllWordCloudResponses(teacherId, classId, sessionId);

  const wordMap = new Map<string, { count: number; students: Set<string> }>();

  for (const response of responses) {
    for (const wordObj of response.words) {
      const wordLower = wordObj.word.toLowerCase();

      if (!wordMap.has(wordLower)) {
        wordMap.set(wordLower, { count: 0, students: new Set() });
      }

      const data = wordMap.get(wordLower)!;
      // 같은 단어가 제출될 때마다 카운트 증가 (더 커지게)
      data.students.add(response.studentCode);
      data.count++;
    }
  }

  return Array.from(wordMap.entries()).map(([word, data]) => ({
    word,
    count: data.count,
    students: Array.from(data.students)
  })).sort((a, b) => b.count - a.count);
}

// 실시간 세션 구독
export function subscribeToWordCloudSession(
  teacherId: string,
  classId: string,
  sessionId: string,
  callback: (session: WordCloudSession | null) => void
): () => void {
  const sessionRef = doc(db, 'teachers', teacherId, 'classes', classId, 'wordclouds', sessionId);

  return onSnapshot(sessionRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.data() as WordCloudSession);
    } else {
      callback(null);
    }
  });
}

// 실시간 응답 구독
export function subscribeToWordCloudResponses(
  teacherId: string,
  classId: string,
  sessionId: string,
  callback: (responses: WordCloudResponse[]) => void
): () => void {
  const responsesRef = collection(db, 'teachers', teacherId, 'classes', classId, 'wordclouds', sessionId, 'responses');

  return onSnapshot(responsesRef, (snapshot) => {
    const responses = snapshot.docs.map(doc => doc.data()) as WordCloudResponse[];
    callback(responses);
  });
}

// 학생의 현재 잔디 스트릭 계산 (어제까지의 연속 평일 일수)
export async function calculateStudentStreak(
  teacherId: string,
  classId: string,
  studentCode: string
): Promise<number> {
  try {
    // 모든 잔디 데이터 가져오기
    const grassData = await getGrassData(teacherId, classId, studentCode);

    if (grassData.length === 0) {
      return 0;
    }

    // 날짜별 맵 생성 (빠른 조회를 위해)
    const grassMap = new Map<string, { cookieChange: number; usedStreakFreeze?: boolean }>();
    grassData.forEach(data => {
      grassMap.set(data.date, { cookieChange: data.cookieChange, usedStreakFreeze: data.usedStreakFreeze });
    });

    // 오늘 제외, 어제부터 시작
    const today = new Date();
    let checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - 1); // 어제

    // 어제가 주말이면 금요일로 조정
    const yesterdayDayOfWeek = checkDate.getDay();
    if (yesterdayDayOfWeek === 0) { // 일요일 -> 금요일 (-2일)
      checkDate.setDate(checkDate.getDate() - 2);
    } else if (yesterdayDayOfWeek === 6) { // 토요일 -> 금요일 (-1일)
      checkDate.setDate(checkDate.getDate() - 1);
    }

    let streak = 0;

    // 최대 365일까지만 확인 (무한루프 방지)
    for (let i = 0; i < 365; i++) {
      const dayOfWeek = checkDate.getDay();

      // 주말은 건너뛰기 (이미 금요일로 반영되어 있음)
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        checkDate.setDate(checkDate.getDate() - 1);
        continue;
      }

      // 평일인 경우 잔디 확인
      const dateStr = getKoreanDateString(checkDate);
      const grassInfo = grassMap.get(dateStr);

      if (grassInfo) {
        if (grassInfo.cookieChange >= 1) {
          // 쿠키가 1개 이상이면 스트릭 증가
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else if (grassInfo.usedStreakFreeze) {
          // 스트릭 프리즈는 연결만 유지 (카운트 안 함)
          checkDate.setDate(checkDate.getDate() - 1);
          continue;
        } else {
          // 쿠키가 0이고 프리즈도 없으면 중단
          break;
        }
      } else {
        // 데이터가 없으면 스트릭 중단
        break;
      }
    }

    return streak;
  } catch (error) {
    console.error('Failed to calculate streak:', error);
    return 0;
  }
}

// 스트릭 프리즈 구매
export async function purchaseStreakFreeze(
  teacherId: string,
  studentCode: string,
  price: number,
  maxCount: number
): Promise<{ success: boolean; message?: string }> {
  try {
    const studentRef = doc(db, 'teachers', teacherId, 'students', studentCode);
    const studentSnap = await getDoc(studentRef);

    if (!studentSnap.exists()) {
      return { success: false, message: '학생 정보를 찾을 수 없습니다.' };
    }

    const student = studentSnap.data() as Student;
    const currentJelly = student.jelly || 0;
    const currentFreezes = student.streakFreezes || 0;

    // 최대 보유 개수 확인
    if (currentFreezes >= maxCount) {
      return { success: false, message: `최대 ${maxCount}개까지만 보유할 수 있습니다.` };
    }

    // 캔디 확인
    if (currentJelly < price) {
      return { success: false, message: `캔디가 부족합니다. (필요: ${price}, 보유: ${currentJelly})` };
    }

    // 구매 처리
    await updateDoc(studentRef, {
      jelly: currentJelly - price,
      streakFreezes: currentFreezes + 1
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to purchase streak freeze:', error);
    return { success: false, message: '구매에 실패했습니다.' };
  }
}

// 스트릭 프리즈 활성화/비활성화
export async function updateActiveStreakFreezes(
  teacherId: string,
  studentCode: string,
  activeCount: number
): Promise<{ success: boolean; message?: string }> {
  try {
    const studentRef = doc(db, 'teachers', teacherId, 'students', studentCode);
    const studentSnap = await getDoc(studentRef);

    if (!studentSnap.exists()) {
      return { success: false, message: '학생 정보를 찾을 수 없습니다.' };
    }

    const student = studentSnap.data() as Student;
    const currentFreezes = student.streakFreezes || 0;

    // 보유 개수보다 많이 활성화할 수 없음
    if (activeCount > currentFreezes) {
      return { success: false, message: '보유한 개수보다 많이 활성화할 수 없습니다.' };
    }

    await updateDoc(studentRef, {
      activeStreakFreezes: activeCount
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to update active streak freezes:', error);
    return { success: false, message: '활성화 변경에 실패했습니다.' };
  }
}

// 스트릭 프리즈 자동 사용 (쿠키 새로고침 시 호출)
export async function autoUseStreakFreezes(
  teacherId: string,
  classId: string,
  studentCode: string
): Promise<void> {
  try {
    // 학생 정보 조회
    const studentRef = doc(db, 'teachers', teacherId, 'students', studentCode);
    const studentSnap = await getDoc(studentRef);

    if (!studentSnap.exists()) return;

    const student = studentSnap.data() as Student;
    const activeFreezes = student.activeStreakFreezes || 0;

    if (activeFreezes === 0) return; // 활성화된 프리즈가 없으면 종료

    // 잔디 데이터 조회
    const grassData = await getGrassData(teacherId, classId, studentCode);
    const grassMap = new Map<string, { cookieChange: number; usedStreakFreeze?: boolean }>();
    grassData.forEach(data => {
      grassMap.set(data.date, { cookieChange: data.cookieChange, usedStreakFreeze: data.usedStreakFreeze });
    });

    // 어제부터 역순으로 빈 날 확인
    const today = new Date();
    let checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - 1); // 어제

    // 어제가 주말이면 금요일로 조정
    const yesterdayDayOfWeek = checkDate.getDay();
    if (yesterdayDayOfWeek === 0) {
      checkDate.setDate(checkDate.getDate() - 2);
    } else if (yesterdayDayOfWeek === 6) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    let usedCount = 0;
    const freezeDates: string[] = [];

    // 최대 활성화된 프리즈 개수만큼 연속된 빈 날 채우기
    for (let i = 0; i < 365 && usedCount < activeFreezes; i++) {
      const dayOfWeek = checkDate.getDay();

      // 주말은 건너뛰기
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        checkDate.setDate(checkDate.getDate() - 1);
        continue;
      }

      const dateStr = getKoreanDateString(checkDate);
      const grassInfo = grassMap.get(dateStr);

      if (!grassInfo || (grassInfo.cookieChange === 0 && !grassInfo.usedStreakFreeze)) {
        // 빈 날 발견 → 스트릭 프리즈 사용
        freezeDates.push(dateStr);
        usedCount++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        // 잔디가 있는 날이면 중단
        break;
      }
    }

    if (usedCount === 0) return; // 사용할 필요 없으면 종료

    // 잔디 데이터에 스트릭 프리즈 기록
    for (const dateStr of freezeDates) {
      const grassRef = doc(db, 'teachers', teacherId, 'classes', classId, 'grass', dateStr);
      const grassSnap = await getDoc(grassRef);

      if (grassSnap.exists()) {
        const records = grassSnap.data().records || {};
        await updateDoc(grassRef, {
          [`records.${studentCode}.usedStreakFreeze`]: true
        });
      } else {
        await setDoc(grassRef, {
          date: dateStr,
          records: {
            [studentCode]: {
              change: 0,
              count: 0,
              usedStreakFreeze: true
            }
          }
        }, { merge: true });  // merge 옵션으로 기존 데이터 보존
      }
    }

    // 학생의 스트릭 프리즈 개수 차감
    const newFreezes = Math.max(0, (student.streakFreezes || 0) - usedCount);
    const newActiveFreezes = Math.max(0, activeFreezes - usedCount);

    await updateDoc(studentRef, {
      streakFreezes: newFreezes,
      activeStreakFreezes: newActiveFreezes
    });
  } catch (error) {
    console.error('Failed to auto use streak freezes:', error);
  }
}