// src/pages/Login.tsx
// Firebase 기반 로그인 페이지

import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';

interface LoginProps {
  onLoginSuccess?: () => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const { loginAsTeacher, registerAsTeacher, loginAsStudent } = useAuth();
  
  // 선생님 로그인 상태
  const [teacherEmail, setTeacherEmail] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [isTeacherLoading, setIsTeacherLoading] = useState(false);
  
  // 선생님 회원가입 상태
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [registerSchool, setRegisterSchool] = useState('');
  const [registerApiKey, setRegisterApiKey] = useState('');
  const [isRegisterLoading, setIsRegisterLoading] = useState(false);
  
  // 학생 로그인 상태
  const [studentCode, setStudentCode] = useState('');
  const [isStudentLoading, setIsStudentLoading] = useState(false);

  // 선생님 로그인/회원가입 모드 토글
  const [teacherMode, setTeacherMode] = useState<'login' | 'register'>('login');

  // 선생님 로그인 처리
  const handleTeacherLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!teacherEmail || !teacherPassword) {
      toast.error('이메일과 비밀번호를 입력해주세요.');
      return;
    }
    
    setIsTeacherLoading(true);
    const result = await loginAsTeacher(teacherEmail, teacherPassword);
    setIsTeacherLoading(false);
    
    if (result.success) {
      toast.success(result.message);
      onLoginSuccess?.();
    } else {
      toast.error(result.message);
    }
  };

  // 선생님 회원가입 처리
  const handleTeacherRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!registerEmail || !registerPassword || !registerName || !registerSchool || !registerApiKey) {
      toast.error('모든 항목을 입력해주세요.');
      return;
    }
    
    if (registerPassword !== registerPasswordConfirm) {
      toast.error('비밀번호가 일치하지 않습니다.');
      return;
    }
    
    if (registerPassword.length < 6) {
      toast.error('비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    
    setIsRegisterLoading(true);
    const result = await registerAsTeacher(
      registerEmail,
      registerPassword,
      registerName,
      registerSchool,
      registerApiKey
    );
    setIsRegisterLoading(false);
    
    if (result.success) {
      toast.success(result.message);
      onLoginSuccess?.();
    } else {
      toast.error(result.message);
    }
  };

  // 학생 로그인 처리
  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!studentCode) {
      toast.error('학생 코드를 입력해주세요.');
      return;
    }
    
    setIsStudentLoading(true);
    const result = await loginAsStudent(studentCode);
    setIsStudentLoading(false);
    
    if (result.success) {
      toast.success(result.message);
      onLoginSuccess?.();
    } else {
      toast.error(result.message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 로고/타이틀 */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🍪</div>
          <h1 className="text-3xl font-bold text-amber-800">다잔디 <span className="text-lg font-normal text-amber-600">DaJanDi</span></h1>
          <p className="text-amber-600 mt-2">학습루틴 게임화 시스템</p>
        </div>

        {/* 로그인 카드 */}
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle className="text-center">로그인</CardTitle>
            <CardDescription className="text-center">
              선생님 또는 학생으로 로그인하세요
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="student" className="w-full">
              <TabsList className="grid w-full grid-cols-2 gap-2 mb-6">
                <TabsTrigger value="student">🎒 학생</TabsTrigger>
                <TabsTrigger value="teacher">👨‍🏫 선생님</TabsTrigger>
              </TabsList>

              {/* 학생 로그인 */}
              <TabsContent value="student">
                <form onSubmit={handleStudentLogin} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">학생 코드</label>
                    <Input
                      type="text"
                      placeholder="선생님께 받은 코드를 입력하세요"
                      value={studentCode}
                      onChange={(e) => setStudentCode(e.target.value)}
                      className="text-center text-lg tracking-wider"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      예: ABC123XYZ
                    </p>
                  </div>
                  <button
                    type="submit"
                    className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                    disabled={isStudentLoading}
                  >
                    <span className="text-xl">🚀</span>
                    <span>{isStudentLoading ? '로그인 중...' : '로그인'}</span>
                  </button>
                </form>
              </TabsContent>

              {/* 선생님 탭 */}
              <TabsContent value="teacher">
                {/* 로그인/회원가입 버튼 토글 */}
                <div className="flex gap-2 mb-4">
                  <button
                    type="button"
                    onClick={() => setTeacherMode('login')}
                    className={`flex-1 py-2 rounded-lg font-medium flex items-center justify-center gap-1 transition-colors ${
                      teacherMode === 'login'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <span>🔑</span>
                    <span>로그인</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTeacherMode('register')}
                    className={`flex-1 py-2 rounded-lg font-medium flex items-center justify-center gap-1 transition-colors ${
                      teacherMode === 'register'
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <span>📝</span>
                    <span>회원가입</span>
                  </button>
                </div>

                {/* 선생님 로그인 */}
                {teacherMode === 'login' && (
                  <form onSubmit={handleTeacherLogin} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">이메일</label>
                      <Input
                        type="email"
                        placeholder="teacher@school.com"
                        value={teacherEmail}
                        onChange={(e) => setTeacherEmail(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">비밀번호</label>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        value={teacherPassword}
                        onChange={(e) => setTeacherPassword(e.target.value)}
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                      disabled={isTeacherLoading}
                    >
                      <span className="text-xl">🔑</span>
                      <span>{isTeacherLoading ? '로그인 중...' : '로그인'}</span>
                    </button>
                  </form>
                )}

                {/* 선생님 회원가입 */}
                {teacherMode === 'register' && (
                  <form onSubmit={handleTeacherRegister} className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">이메일</label>
                      <Input
                        type="email"
                        placeholder="teacher@school.com"
                        value={registerEmail}
                        onChange={(e) => setRegisterEmail(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">비밀번호</label>
                      <Input
                        type="password"
                        placeholder="6자 이상"
                        value={registerPassword}
                        onChange={(e) => setRegisterPassword(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">비밀번호 확인</label>
                      <Input
                        type="password"
                        placeholder="비밀번호 다시 입력"
                        value={registerPasswordConfirm}
                        onChange={(e) => setRegisterPasswordConfirm(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">이름</label>
                      <Input
                        type="text"
                        placeholder="홍길동"
                        value={registerName}
                        onChange={(e) => setRegisterName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">학교명</label>
                      <Input
                        type="text"
                        placeholder="OO고등학교"
                        value={registerSchool}
                        onChange={(e) => setRegisterSchool(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">다했니 API 키</label>
                      <Input
                        type="text"
                        placeholder="다했니에서 발급받은 API 키"
                        value={registerApiKey}
                        onChange={(e) => setRegisterApiKey(e.target.value)}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        다했니 사이트에서 발급받은 API 키를 입력하세요
                      </p>
                    </div>
                    <button
                      type="submit"
                      className="w-full py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                      disabled={isRegisterLoading}
                    >
                      <span className="text-xl">📝</span>
                      <span>{isRegisterLoading ? '가입 중...' : '회원가입'}</span>
                    </button>
                  </form>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* 푸터 */}
        <p className="text-center text-amber-700 text-sm mt-6">
          © 2025 DaJanDi - 학습루틴 게임화 시스템 by CNSA 신도경T
        </p>
      </div>
    </div>
  );
}