// src/pages/TeacherDashboard.tsx
// 선생님 대시보드 - Firebase 버전

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useStudent } from '../contexts/StudentContext';
import { Button } from '../components/ui/button';
import { FeedbackModal, FeedbackButton } from '../components/FeedbackModal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Checkbox } from '../components/ui/checkbox';
import { toast } from 'sonner';
import { db } from '../services/firebase';
import { doc, setDoc, onSnapshot, updateDoc, deleteDoc, collection, serverTimestamp, getDocs } from 'firebase/firestore';
import {
  createClass,
  getClasses,
  getClassStudents,
  createStudent,
  refreshStudentCookies,
  fetchClassroomsFromDahandin,
  fetchStudentFromDahandin,
  getGrassData,
  deleteAllStudents,
  getStudent,
  getTeacherShopItems,
  addShopItem,
  deleteShopItem,
  deleteAllShopItems,
  getTeams,
  createTeam,
  deleteTeam,
  addTeamMember,
  removeTeamMember,
  getBattles,
  createBattle,
  updateBattleScore,
  endBattle,
  deleteBattle,
  getWishes,
  grantWish,
  deleteWish,
  cleanupExpiredGrantedWishes,
  migrateWishesClassId,
  addCookiesToStudent,
  ClassInfo,
  Student,
  Badge,
  ShopItem,
  Team,
  Battle,
  Wish,
  updateShopItem,
  resetGrassData,
  updateTeamCookie,
  updateTeam,
  addGrassRecordForDate,
  migrateGrassDateToToday,
  updateTeacher,
  CookieShopItem,
  CookieShopRequest,
  getCookieShopItems,
  addCookieShopItem,
  updateCookieShopItem,
  deleteCookieShopItem,
  getCookieShopRequests,
  updateCookieShopRequestStatus,
  deleteCookieShopRequest,
  ItemSuggestion,
  getItemSuggestions,
  updateItemSuggestionStatus,
  deleteItemSuggestion,
  saveClassGroup,
  getClassGroups,
  deleteClassGroupFromFirestore
} from '../services/firestoreApi';
import { parseXlsxFile, downloadCsvTemplate, exportStudentsToCsv, parsePastGrassXlsx, PastGrassData } from '../utils/csv';
import { getKoreanDateString, getLastWeekdays, getLastWeekdaysWithData } from '../utils/dateUtils';
import { TEAM_FLAGS, generateRandomTeamNameWithEmoji } from '../types/game';
import { ALL_SHOP_ITEMS } from '../types/shop';
import { TeacherWordCloud } from '../components/wordcloud/TeacherWordCloud';
import GrassFieldModal from '../components/GrassFieldModal';
import Joyride, { CallBackProps, STATUS, ACTIONS, EVENTS, TooltipRenderProps } from 'react-joyride';
import { teacherTutorialSteps, TutorialStep, TUTORIAL_DUMMY_STUDENTS, TUTORIAL_DUMMY_TEAMS, TUTORIAL_DUMMY_GRASS, TUTORIAL_DUMMY_WISHES } from '../config/tutorialSteps';
import { useTutorial } from '../hooks/useTutorial';

// Helper function to get tab-specific step info
function getTabStepInfo(stepIndex: number): { currentInTab: number; totalInTab: number; tabName: string } {
  const currentStep = teacherTutorialSteps[stepIndex] as TutorialStep;
  const currentTab = currentStep?.data?.tab || 'classes';

  // Get all steps for current tab
  const tabSteps = teacherTutorialSteps
    .map((step, idx) => ({ step: step as TutorialStep, idx }))
    .filter(({ step }) => step.data?.tab === currentTab);

  const currentInTab = tabSteps.findIndex(({ idx }) => idx === stepIndex) + 1;
  const totalInTab = tabSteps.length;

  return { currentInTab, totalInTab, tabName: currentTab };
}

// Custom tooltip component for tab-specific step counter
function CustomTooltip({
  continuous,
  index,
  step,
  backProps,
  closeProps,
  primaryProps,
  skipProps,
  tooltipProps,
}: TooltipRenderProps) {
  const { currentInTab, totalInTab } = getTabStepInfo(index);

  return (
    <div {...tooltipProps} className="relative bg-white rounded-lg shadow-xl max-w-md p-4 border border-gray-200">
      {/* Close button */}
      <button
        {...closeProps}
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          background: 'none',
          border: 'none',
          fontSize: '20px',
          color: '#666',
          cursor: 'pointer',
          padding: '4px 8px',
          lineHeight: 1,
        }}
      >
        ✕
      </button>

      {/* Title */}
      {step.title && (
        <h3 className="text-lg font-bold text-gray-800 mb-2 pr-6">{step.title}</h3>
      )}

      {/* Content */}
      <div className="text-gray-600 text-sm mb-4">{step.content}</div>

      {/* Footer with buttons and progress */}
      <div className="flex items-center justify-between">
        <button {...skipProps} className="text-gray-400 hover:text-gray-600 text-sm">
          건너뛰기
        </button>

        <div className="flex items-center gap-2">
          {index > 0 && (
            <button
              {...backProps}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
            >
              이전
            </button>
          )}

          <span className="text-xs text-gray-400">
            {currentInTab} / {totalInTab}
          </span>

          {continuous && (
            <button
              {...primaryProps}
              className="px-4 py-1.5 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
              {index === teacherTutorialSteps.length - 1 ? '완료' : '다음'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface TeacherDashboardProps {
  onLogout: () => void;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export function TeacherDashboard({ onLogout }: TeacherDashboardProps) {
  const { user, teacher, classes, selectedClass, selectClass, refreshClasses, updateTeacherEmail } = useAuth();
  const { classGroups, addClassGroup, updateClassGroup, deleteClassGroup, getGroupForClass, syncFromFirestore } = useStudent();
  const { runTutorial, stepIndex, setStepIndex, startTutorial, neverShowAgain } = useTutorial();
  const [showHelpMenu, setShowHelpMenu] = useState(false);

  // Get first step index for a specific tab
  const getFirstStepIndexForTab = (tabName: string): number => {
    return teacherTutorialSteps.findIndex(step => {
      const tutorialStep = step as TutorialStep;
      return tutorialStep.data?.tab === tabName;
    });
  };

  // Tutorial tab state
  const [activeTab, setActiveTab] = useState('classes');

  // Joyride callback handler with tab navigation and actions
  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status, action, index, type, step } = data;

    // Handle tutorial completion
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      neverShowAgain();
      return;
    }

    // Handle X button click (close)
    if (action === ACTIONS.CLOSE) {
      neverShowAgain();
      return;
    }

    // Handle tab navigation for NEXT action
    if (type === EVENTS.STEP_AFTER && action === ACTIONS.NEXT) {
      // Update step index for controlled mode
      setStepIndex(index + 1);

      const nextStep = teacherTutorialSteps[index + 1] as TutorialStep | undefined;
      if (nextStep?.data?.tab) {
        setActiveTab(nextStep.data.tab);
      }

      // Execute action after step completes
      const currentStep = step as TutorialStep;
      if (currentStep?.data?.action) {
        setTimeout(() => {
          if (currentStep.data?.action === 'import-classes') {
            const importBtn = document.querySelector('[data-tutorial="import-classes"]') as HTMLButtonElement;
            if (importBtn && !importBtn.disabled) {
              importBtn.click();
            }
          } else if (currentStep.data?.action === 'select-first-class') {
            if (classes.length > 0 && !selectedClass) {
              selectClass(classes[0].id);
            }
          } else if (currentStep.data?.action === 'register-default-items') {
            const registerBtn = document.querySelector('[data-tutorial="register-default-items"]') as HTMLButtonElement;
            if (registerBtn && !registerBtn.disabled) {
              registerBtn.click();
            }
          } else if (currentStep.data?.action === 'click-cookie-shop') {
            const cookieShopTab = document.querySelector('[data-tutorial="cookie-shop-tab"]') as HTMLButtonElement;
            if (cookieShopTab) {
              cookieShopTab.click();
            }
          } else if (currentStep.data?.action === 'click-team-status') {
            const teamStatusTab = document.querySelector('[data-tutorial="team-status-tab"]') as HTMLButtonElement;
            if (teamStatusTab) {
              teamStatusTab.click();
            }
          } else if (currentStep.data?.action === 'click-team-manage') {
            const teamManageTab = document.querySelector('[data-tutorial="team-manage-tab"]') as HTMLButtonElement;
            if (teamManageTab) {
              teamManageTab.click();
            }
          }
        }, 300);
      }
    }

    // Handle tab navigation for PREV action
    if (type === EVENTS.STEP_AFTER && action === ACTIONS.PREV) {
      // Update step index for controlled mode
      setStepIndex(index - 1);

      const prevStep = teacherTutorialSteps[index - 1] as TutorialStep | undefined;
      if (prevStep?.data?.tab) {
        setActiveTab(prevStep.data.tab);
      }
    }

    // Handle step before - navigate to correct tab and execute preAction
    if (type === EVENTS.STEP_BEFORE) {
      const currentStep = step as TutorialStep;
      if (currentStep?.data?.tab) {
        setActiveTab(currentStep.data.tab);
      }

      // Execute preAction before showing step (for sub-tab clicks)
      if (currentStep?.data?.preAction) {
        setTimeout(() => {
          if (currentStep.data?.preAction === 'click-candy-shop') {
            const candyShopTab = document.querySelector('[data-tutorial="candy-shop-tab"]') as HTMLButtonElement;
            if (candyShopTab) {
              candyShopTab.click();
            }
          } else if (currentStep.data?.preAction === 'click-cookie-shop') {
            const cookieShopTab = document.querySelector('[data-tutorial="cookie-shop-tab"]') as HTMLButtonElement;
            if (cookieShopTab) {
              cookieShopTab.click();
            }
          } else if (currentStep.data?.preAction === 'click-team-manage') {
            const teamManageTab = document.querySelector('[data-tutorial="team-manage-tab"]') as HTMLButtonElement;
            if (teamManageTab) {
              teamManageTab.click();
            }
          } else if (currentStep.data?.preAction === 'click-team-status') {
            const teamStatusTab = document.querySelector('[data-tutorial="team-status-tab"]') as HTMLButtonElement;
            if (teamStatusTab) {
              teamStatusTab.click();
            }
          }
        }, 100);
      }
    }

    // Handle target not found - try to navigate to correct tab
    if (type === EVENTS.TARGET_NOT_FOUND) {
      const currentStep = step as TutorialStep;
      if (currentStep?.data?.tab) {
        setActiveTab(currentStep.data.tab);
      }
    }
  };

  // Close help menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showHelpMenu && !(e.target as HTMLElement).closest('.relative')) {
        setShowHelpMenu(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showHelpMenu]);

  // Tutorial keyboard navigation (arrow keys)
  useEffect(() => {
    if (!runTutorial) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (stepIndex < teacherTutorialSteps.length - 1) {
          const nextStep = teacherTutorialSteps[stepIndex + 1] as TutorialStep;
          if (nextStep?.data?.tab) {
            setActiveTab(nextStep.data.tab);
          }
          setStepIndex(stepIndex + 1);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (stepIndex > 0) {
          const prevStep = teacherTutorialSteps[stepIndex - 1] as TutorialStep;
          if (prevStep?.data?.tab) {
            setActiveTab(prevStep.data.tab);
          }
          setStepIndex(stepIndex - 1);
        }
      } else if (e.key === 'Escape') {
        neverShowAgain();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [runTutorial, stepIndex, neverShowAgain]);

  // Firestore에서 학급 그룹 동기화
  useEffect(() => {
    if (user?.uid) {
      syncFromFirestore(user.uid);
    }
  }, [user?.uid, syncFromFirestore]);

  // Tab change data loading (for tutorial navigation)
  useEffect(() => {
    if (!user || !selectedClass) return;

    // Load data when tab changes
    switch (activeTab) {
      case 'grass':
        loadGrassData();
        break;
      case 'shop':
        loadShopItems();
        break;
      case 'teams':
        loadTeams();
        break;
      case 'wishes':
        loadWishes();
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // 상태
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // 튜토리얼 모드일 때 학생이 없으면 더미 데이터 표시
  const displayStudents = runTutorial && students.length === 0 ? TUTORIAL_DUMMY_STUDENTS : students;
  
  // 새 학급 추가
  const [newClassName, setNewClassName] = useState('');
  const [isCreatingClass, setIsCreatingClass] = useState(false);

  // 학급 가리기
  const [hiddenClasses, setHiddenClasses] = useState<string[]>(() => {
    const saved = localStorage.getItem('hiddenClasses');
    return saved ? JSON.parse(saved) : [];
  });
  const [hideMode, setHideMode] = useState(false);
  const [viewHiddenMode, setViewHiddenMode] = useState(false);
  const [selectedForHide, setSelectedForHide] = useState<string[]>([]);

  // 학급 묶기 (소원 공유)
  const [groupMode, setGroupMode] = useState(false);
  const [selectedForGroup, setSelectedForGroup] = useState<string[]>([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');

  // 프로필 수정
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSchoolName, setEditSchoolName] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // 이메일 변경
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [isChangingEmail, setIsChangingEmail] = useState(false);

  // 전체 동기화
  const [isSyncing, setIsSyncing] = useState(false);

  // To개발자 모달
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  // 학급 선택 시 학생 목록 로드
  useEffect(() => {
    if (selectedClass && user) {
      loadStudents();
    }
  }, [selectedClass, user]);

  // 로그인 시 모든 학급 자동 새로고침 (최초 1회)
  const [hasAutoRefreshed, setHasAutoRefreshed] = useState(false);
  useEffect(() => {
    const autoRefreshAllClasses = async () => {
      if (!user || !teacher || !classes || classes.length === 0 || hasAutoRefreshed) return;

      setHasAutoRefreshed(true);
      console.log('🔄 자동 새로고침 시작...');

      let totalRefreshed = 0;
      for (const classInfo of classes) {
        try {
          const result = await refreshStudentCookies(user.uid, classInfo.id, teacher.dahandinApiKey);
          totalRefreshed += result.count;
        } catch (error) {
          console.error(`Failed to auto-refresh class ${classInfo.name}:`, error);
        }
      }

      if (totalRefreshed > 0) {
        console.log(`✅ ${totalRefreshed}명의 학생 정보 자동 새로고침 완료`);
        // 현재 선택된 학급이 있으면 학생 목록도 새로고침
        if (selectedClass) {
          await loadStudents();
        }
      }
    };

    autoRefreshAllClasses();
  }, [user, teacher, classes, hasAutoRefreshed]);

  // localStorage 학급그룹을 Firestore로 동기화 (기존 그룹 마이그레이션)
  const [hasGroupSynced, setHasGroupSynced] = useState(false);
  useEffect(() => {
    const syncClassGroupsToFirestore = async () => {
      if (!user || hasGroupSynced || classGroups.length === 0) return;

      setHasGroupSynced(true);
      console.log('🔄 학급그룹 Firestore 동기화 시작...');

      try {
        // 기존 Firestore 그룹 확인
        const existingGroups = await getClassGroups(user.uid);
        const existingIds = new Set(existingGroups.map(g => g.id));

        // localStorage에만 있는 그룹을 Firestore에 저장
        let syncCount = 0;
        for (const group of classGroups) {
          if (!existingIds.has(group.id)) {
            await saveClassGroup(user.uid, group.id, group.name, group.classIds);
            syncCount++;
          }
        }

        if (syncCount > 0) {
          console.log(`✅ ${syncCount}개 학급그룹 Firestore 동기화 완료`);
        }
      } catch (error) {
        console.error('Failed to sync class groups:', error);
      }
    };

    syncClassGroupsToFirestore();
  }, [user, classGroups, hasGroupSynced]);

  // 학생 목록 로드
  const loadStudents = async () => {
    if (!user || !selectedClass) return;

    setIsLoadingStudents(true);
    try {
      const studentsData = await getClassStudents(user.uid, selectedClass);
      setStudents(studentsData);
    } catch (error) {
      console.error('Failed to load students:', error);
      toast.error('학생 목록을 불러오는데 실패했습니다.');
    }
    setIsLoadingStudents(false);
  };

  // 전체 동기화 (학생 정보, 상점 요청, 물품 요청 등 모든 데이터)
  const handleSync = async () => {
    if (!user || !teacher) return;

    setIsSyncing(true);
    try {
      // 학급 목록 새로고침
      await refreshClasses();

      // 현재 선택된 학급이 있으면 학생 정보 새로고침
      if (selectedClass) {
        // 다했니 연동 학생 정보 새로고침
        await refreshStudentCookies(user.uid, selectedClass, teacher.dahandinApiKey);

        // 학생 목록 다시 로드
        const studentsData = await getClassStudents(user.uid, selectedClass);
        setStudents(studentsData);

        // 쿠키 상점 요청 새로고침
        const requests = await getCookieShopRequests(user.uid);
        setCookieShopRequests(requests);

        // 물품 요청 현황 새로고침
        const suggestions = await getItemSuggestions(user.uid);
        setItemSuggestions(suggestions);

        // 팀 정보 새로고침
        const teamsData = await getTeams(user.uid, selectedClass);
        setTeams(teamsData);
      }

      toast.success('모든 데이터를 동기화했습니다! 🔄');
    } catch (error) {
      console.error('Failed to sync data:', error);
      toast.error('동기화에 실패했습니다.');
    }
    setIsSyncing(false);
  };

  // 프로필 수정 시작
  const startEditingProfile = () => {
    setEditName(teacher?.name || '');
    setEditSchoolName(teacher?.schoolName || '');
    setIsEditingProfile(true);
  };

  // 프로필 저장
  const saveProfile = async () => {
    if (!user) return;

    if (!editName.trim()) {
      toast.error('이름을 입력해주세요.');
      return;
    }

    setIsSavingProfile(true);
    try {
      await updateTeacher(user.uid, {
        name: editName.trim(),
        schoolName: editSchoolName.trim()
      });
      toast.success('프로필이 수정되었습니다.');
      setIsEditingProfile(false);
      // AuthContext에서 teacher 정보 갱신을 위해 페이지 새로고침
      window.location.reload();
    } catch (error) {
      console.error('Failed to update profile:', error);
      toast.error('프로필 수정에 실패했습니다.');
    }
    setIsSavingProfile(false);
  };

  // 프로필 수정 취소
  const cancelEditingProfile = () => {
    setIsEditingProfile(false);
    setEditName('');
    setEditSchoolName('');
  };

  // 이메일 변경 시작
  const startEditingEmail = () => {
    setNewEmail(teacher?.email || '');
    setEmailPassword('');
    setIsEditingEmail(true);
  };

  // 이메일 변경 저장
  const handleChangeEmail = async () => {
    if (!newEmail.trim()) {
      toast.error('새 이메일을 입력해주세요.');
      return;
    }
    if (!emailPassword) {
      toast.error('현재 비밀번호를 입력해주세요.');
      return;
    }
    if (newEmail === teacher?.email) {
      toast.error('현재와 동일한 이메일입니다.');
      return;
    }

    setIsChangingEmail(true);
    const result = await updateTeacherEmail(newEmail.trim(), emailPassword);

    if (result.success) {
      toast.success(result.message);
      setIsEditingEmail(false);
      setNewEmail('');
      setEmailPassword('');
    } else {
      toast.error(result.message);
    }
    setIsChangingEmail(false);
  };

  // 이메일 변경 취소
  const cancelEditingEmail = () => {
    setIsEditingEmail(false);
    setNewEmail('');
    setEmailPassword('');
  };

  // 애니메이션 스타일 클래스
  const getAnimationClass = (value: string) => {
    const animMap: Record<string, string> = {
      'none': '',
      'pulse': 'animate-pulse',
      'spin': 'animate-spin-slow',
      'bounce': 'animate-bounce',
      'shake': 'animate-shake',
      'sparkle': 'animate-sparkle',
      'wave': 'animate-wave',
      'float': 'animate-float',
      'confetti': 'animate-confetti',
      'flame': 'animate-flame',
      'snow': 'animate-snow',
    };
    return animMap[value] || '';
  };

  // 이모지 코드에서 이모지 가져오기
  const getEmojiFromCode = (code: string | undefined): string => {
    if (!code) return '';
    // 코드 형식(emoji_XX)인 경우 아이템에서 조회
    if (code.startsWith('emoji_')) {
      const item = ALL_SHOP_ITEMS.find(i => i.code === code);
      return item?.value || '';
    }
    // 이미 이모지 값인 경우 그대로 반환
    return code;
  };

  // 테두리 색상값 (inline style용) - 파스텔톤
  const getBorderColor = (value: string | undefined): string => {
    if (!value) return 'rgb(209 213 219)'; // gray-300
    const colorMap: Record<string, string> = {
      'gray-300': 'rgb(209 213 219)',
      'gray-800': 'rgb(31 41 55)',
      'border-blue-500': 'rgb(147 197 253)',      // 파스텔 블루
      'border-red-500': 'rgb(252 165 165)',       // 파스텔 레드
      'border-green-500': 'rgb(134 239 172)',     // 파스텔 그린
      'border-yellow-500': 'rgb(253 224 71)',     // 파스텔 옐로우
      'border-purple-500': 'rgb(196 181 253)',    // 파스텔 퍼플
      'border-pink-500': 'rgb(249 168 212)',      // 파스텔 핑크
      'border-amber-400': 'rgb(252 211 77)',      // 파스텔 앰버
      'border-gray-800': 'rgb(31 41 55)',
      'border-orange-500': 'rgb(253 186 116)',    // 파스텔 오렌지
      'border-cyan-500': 'rgb(103 232 249)',      // 파스텔 시안
      'border-teal-500': 'rgb(94 234 212)',       // 파스텔 틸
      'border-indigo-500': 'rgb(165 180 252)',    // 파스텔 인디고
      // 색상 이름 직접 지원
      'blue': 'rgb(147 197 253)',
      'red': 'rgb(252 165 165)',
      'green': 'rgb(134 239 172)',
      'yellow': 'rgb(253 224 71)',
      'purple': 'rgb(196 181 253)',
      'pink': 'rgb(249 168 212)',
      'amber': 'rgb(252 211 77)',
      'orange': 'rgb(253 186 116)',
    };
    return colorMap[value] || 'rgb(209 213 219)';
  };

  // 배경 색상값 (inline style용) - 파스텔톤
  const getFillColor = (value: string | undefined): string => {
    if (!value || value === 'none') return 'transparent';
    const colorMap: Record<string, string> = {
      'none': 'transparent',
      'transparent': 'transparent',
      'white': 'rgb(255 255 255)',
      'bg-blue-500': 'rgb(191 219 254)',          // 파스텔 블루
      'bg-red-500': 'rgb(254 202 202)',           // 파스텔 레드
      'bg-green-500': 'rgb(187 247 208)',         // 파스텔 그린
      'bg-green-200': 'rgb(187 247 208)',
      'bg-green-300': 'rgb(134 239 172)',
      'bg-yellow-500': 'rgb(254 240 138)',        // 파스텔 옐로우
      'bg-purple-500': 'rgb(221 214 254)',        // 파스텔 퍼플
      'bg-pink-500': 'rgb(251 207 232)',          // 파스텔 핑크
      'bg-amber-400': 'rgb(253 230 138)',         // 파스텔 앰버
      'bg-gray-800': 'rgb(31 41 55)',
      'bg-orange-500': 'rgb(254 215 170)',        // 파스텔 오렌지
      'bg-cyan-500': 'rgb(165 243 252)',          // 파스텔 시안
      'bg-teal-500': 'rgb(153 246 228)',          // 파스텔 틸
      'bg-indigo-500': 'rgb(199 210 254)',        // 파스텔 인디고
      // 색상 이름 직접 지원
      'blue': 'rgb(191 219 254)',
      'red': 'rgb(254 202 202)',
      'green': 'rgb(187 247 208)',
      'light-green': 'rgb(220 252 231)',
      'yellow': 'rgb(254 240 138)',
      'purple': 'rgb(221 214 254)',
      'pink': 'rgb(251 207 232)',
      'amber': 'rgb(253 230 138)',
      'orange': 'rgb(254 215 170)',
    };
    return colorMap[value] || 'transparent';
  };

  // 그라데이션 여부 확인
  const isGradientFill = (value: string | undefined): boolean => {
    if (!value) return false;
    return value.startsWith('gradient-') || value === 'bg-gradient-to-r from-pink-500 to-purple-500';
  };

  // 그라데이션 CSS 값 가져오기 - 파스텔톤
  const getGradientStyle = (value: string | undefined): string => {
    const gradientMap: Record<string, string> = {
      // 부드러운 파스텔 그라데이션
      'gradient-rainbow': 'linear-gradient(to right, rgb(254 202 202), rgb(254 240 138), rgb(187 247 208), rgb(191 219 254), rgb(221 214 254))',
      'gradient-fire': 'linear-gradient(to right, rgb(254 202 202), rgb(254 215 170), rgb(254 240 138))',
      'gradient-ocean': 'linear-gradient(to right, rgb(165 243 252), rgb(191 219 254), rgb(199 210 254))',
      'gradient-sunset': 'linear-gradient(to right, rgb(254 215 170), rgb(251 207 232), rgb(221 214 254))',
      'gradient-aurora': 'linear-gradient(to right, rgb(187 247 208), rgb(165 243 252), rgb(221 214 254))',
      'gradient-pink-purple': 'linear-gradient(to right, rgb(251 207 232), rgb(221 214 254))',
      'gradient-mint': 'linear-gradient(to right, rgb(165 243 252), rgb(153 246 228))',
      'gradient-orange': 'linear-gradient(to right, rgb(254 240 138), rgb(254 215 170))',
      // 추가 파스텔 그라데이션
      'gradient-cotton-candy': 'linear-gradient(to right, rgb(251 207 232), rgb(191 219 254))',
      'gradient-peach': 'linear-gradient(to right, rgb(254 215 170), rgb(251 207 232))',
      'gradient-lavender': 'linear-gradient(to right, rgb(221 214 254), rgb(251 207 232))',
      'gradient-spring': 'linear-gradient(to right, rgb(187 247 208), rgb(254 240 138))',
      'gradient-sky': 'linear-gradient(to right, rgb(191 219 254), rgb(165 243 252))',
      'bg-gradient-to-r from-pink-500 to-purple-500': 'linear-gradient(to right, rgb(251 207 232), rgb(221 214 254))',
    };
    return gradientMap[value || ''] || '';
  };

  // 이름 효과 스타일 클래스
  const getNameEffectClass = (value: string | undefined) => {
    if (!value) return '';
    const effectMap: Record<string, string> = {
      'none': '',
      'gradient-rainbow': 'block bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 bg-clip-text text-transparent',
      'gradient-fire': 'block bg-gradient-to-r from-orange-500 via-red-500 to-yellow-500 bg-clip-text text-transparent',
      'gradient-ocean': 'block bg-gradient-to-r from-blue-400 via-cyan-500 to-teal-500 bg-clip-text text-transparent',
      'gradient-gold': 'block bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 bg-clip-text text-transparent',
      'glow-blue': 'text-blue-500 drop-shadow-lg',
      'glow-pink': 'text-pink-500 drop-shadow-lg',
      'glow-gold': 'text-amber-500 drop-shadow-lg',
      'shadow': 'text-gray-800 drop-shadow-md',
    };
    return effectMap[value] || '';
  };

  // 칭호 색상 스타일
  const getTitleColorClass = (value: string | undefined) => {
    if (!value) return 'text-gray-600';
    const colorMap: Record<string, string> = {
      '0': 'text-red-500',
      '1': 'text-orange-500',
      '2': 'text-yellow-500',
      '3': 'text-green-500',
      '4': 'text-blue-500',
      '5': 'text-purple-500',
      '6': 'text-pink-500',
      '7': 'text-gray-800',
      '8': 'text-amber-600',
      '9': 'block bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 bg-clip-text text-transparent',
    };
    return colorMap[value] || 'text-gray-600';
  };

  // 배경 스타일 클래스
  const getBackgroundClass = (value: string | undefined) => {
    if (!value) return 'bg-transparent';
    const bgMap: Record<string, string> = {
      'none': 'bg-transparent',
      'dots': 'bg-pattern-dots',
      'stripes': 'bg-pattern-stripes',
      'waves': 'bg-pattern-waves',
      'hearts': 'bg-pattern-hearts',
      'stars': 'bg-pattern-stars',
      'gradient-soft': 'bg-gradient-to-br from-pink-50 to-blue-50',
      'gradient-vivid': 'bg-gradient-to-br from-purple-100 to-pink-100',
      'gradient-mint': 'bg-gradient-to-br from-green-50 to-cyan-50',
      'gradient-sunset': 'bg-gradient-to-br from-orange-50 to-pink-50',
      'gradient-lavender': 'bg-gradient-to-br from-purple-50 to-indigo-50',
    };
    return bgMap[value] || 'bg-transparent';
  };

  // 잔디 색상
  const getGrassColor = (cookieChange: number) => {
    if (cookieChange === 0) return 'bg-gray-200';
    if (cookieChange === 1) return 'bg-green-300';
    if (cookieChange === 2) return 'bg-green-500';
    return 'bg-green-700';
  };

  // 프로필 학생 선택 및 잔디 데이터 로드
  const handleSelectProfileStudent = async (student: Student) => {
    setSelectedProfileStudent(student);
    setProfileStudentGrass([]);

    if (!user || !selectedClass) return;

    setIsLoadingProfileGrass(true);
    try {
      const grass = await getGrassData(user.uid, selectedClass, student.code);
      setProfileStudentGrass(grass.map(g => ({ date: g.date, cookieChange: g.cookieChange, count: g.count || 1 })));
    } catch (error) {
      console.error('Failed to load profile student grass:', error);
    }
    setIsLoadingProfileGrass(false);
  };

  // 다했니 API에서 학급 가져오기
  const handleImportClassrooms = async () => {
    if (!user || !teacher) return;
    
    setIsImporting(true);
    try {
      const classrooms = await fetchClassroomsFromDahandin(teacher.dahandinApiKey);
      
      for (const classroom of classrooms) {
        // name을 ID로도 사용 (공백은 하이픈으로 변경)
        const classId = classroom.name.replace(/\s+/g, '-');
        await createClass(user.uid, classId, classroom.name);
      }
      
      await refreshClasses();
      toast.success(`${classrooms.length}개 학급을 가져왔습니다!`);
    } catch (error: any) {
      console.error('Failed to import classrooms:', error);
      toast.error(error.message || '학급 가져오기에 실패했습니다.');
    }
    setIsImporting(false);
  };

  // 새 학급 생성
  const handleCreateClass = async () => {
    if (!user || !newClassName.trim()) {
      toast.error('학급 이름을 입력해주세요.');
      return;
    }
    
    setIsCreatingClass(true);
    try {
      const classId = newClassName.trim().replace(/\s+/g, '-');
      await createClass(user.uid, classId, newClassName.trim());
      await refreshClasses();
      setNewClassName('');
      toast.success('학급이 생성되었습니다!');
    } catch (error) {
      console.error('Failed to create class:', error);
      toast.error('학급 생성에 실패했습니다.');
    }
    setIsCreatingClass(false);
  };

  // 학급 가리기 토글
  const handleToggleHideClass = (classId: string) => {
    setSelectedForHide(prev =>
      prev.includes(classId)
        ? prev.filter(id => id !== classId)
        : [...prev, classId]
    );
  };

  // 선택한 학급 숨기기 적용
  const handleApplyHide = () => {
    const newHidden = [...new Set([...hiddenClasses, ...selectedForHide])];
    setHiddenClasses(newHidden);
    localStorage.setItem('hiddenClasses', JSON.stringify(newHidden));
    setSelectedForHide([]);
    setHideMode(false);
    toast.success(`${selectedForHide.length}개 학급을 숨겼습니다.`);
  };

  // 선택한 학급 숨김 해제
  const handleApplyUnhide = () => {
    const newHidden = hiddenClasses.filter(id => !selectedForHide.includes(id));
    setHiddenClasses(newHidden);
    localStorage.setItem('hiddenClasses', JSON.stringify(newHidden));
    setSelectedForHide([]);
    setViewHiddenMode(false);
    toast.success(`${selectedForHide.length}개 학급 숨김을 해제했습니다.`);
  };

  // 그룹 모드 학급 토글
  const handleToggleGroupClass = (classId: string) => {
    setSelectedForGroup(prev =>
      prev.includes(classId)
        ? prev.filter(id => id !== classId)
        : [...prev, classId]
    );
  };

  // 학급 그룹 생성 (localStorage + Firestore)
  const handleCreateGroup = async () => {
    if (!user) return;
    if (selectedForGroup.length < 2) {
      toast.error('2개 이상의 학급을 선택해주세요.');
      return;
    }
    if (!groupName.trim()) {
      toast.error('그룹 이름을 입력해주세요.');
      return;
    }

    try {
      // localStorage에 저장 (기존 로직)
      const newGroup = addClassGroup(groupName, selectedForGroup);

      // Firestore에도 저장 (학생이 접근할 수 있도록)
      await saveClassGroup(user.uid, newGroup.id, groupName, selectedForGroup);

      toast.success(`"${groupName}" 그룹이 생성되었습니다.`);
      setSelectedForGroup([]);
      setGroupMode(false);
      setShowGroupModal(false);
      setGroupName('');
    } catch (error) {
      console.error('Failed to save class group:', error);
      toast.error('그룹 저장에 실패했습니다.');
    }
  };

  // 학급 그룹 삭제 (localStorage + Firestore)
  const handleDeleteGroup = async (groupId: string, groupNameToDelete: string) => {
    if (!user) return;
    if (window.confirm(`"${groupNameToDelete}" 그룹을 삭제하시겠습니까?`)) {
      try {
        // localStorage에서 삭제 (기존 로직)
        deleteClassGroup(groupId);

        // Firestore에서도 삭제
        await deleteClassGroupFromFirestore(user.uid, groupId);

        toast.success('그룹이 삭제되었습니다.');
      } catch (error) {
        console.error('Failed to delete class group:', error);
        toast.error('그룹 삭제에 실패했습니다.');
      }
    }
  };

  // 쿠키 새로고침
  const handleRefreshCookies = async () => {
    if (!user || !teacher || !selectedClass) {
      toast.error('학급을 먼저 선택해주세요.');
      return;
    }
    
    setIsRefreshing(true);
    try {
      const result = await refreshStudentCookies(user.uid, selectedClass, teacher.dahandinApiKey);
      if (result.success) {
        await loadStudents();
        toast.success(`${result.count}명의 쿠키 정보를 업데이트했습니다!`);
      } else {
        toast.error(result.error || '새로고침할 수 없습니다.');
      }
    } catch (error) {
      console.error('Failed to refresh cookies:', error);
      toast.error('쿠키 새로고침에 실패했습니다.');
    }
    setIsRefreshing(false);
  };

  // 학생 수동 추가
  const [newStudentNumber, setNewStudentNumber] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentCode, setNewStudentCode] = useState('');
  const [isAddingStudent, setIsAddingStudent] = useState(false);

  // CSV 업로드
  const [isUploadingCsv, setIsUploadingCsv] = useState(false);

  // 학생 초기화
  const [isResettingStudents, setIsResettingStudents] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // 잔디 데이터
  const [grassData, setGrassData] = useState<Array<{ date: string; studentCode: string; cookieChange: number; count: number }>>([]);
  const [isLoadingGrass, setIsLoadingGrass] = useState(false);
  const [isResettingGrass, setIsResettingGrass] = useState(false);
  const [isUploadingPastGrass, setIsUploadingPastGrass] = useState(false);
  const [pastGrassYear, setPastGrassYear] = useState(new Date().getFullYear());
  const [grassOffset, setGrassOffset] = useState(0); // 잔디 네비게이션 오프셋 (10일 단위)

  // 잔디밭 모달
  const [showGrassFieldModal, setShowGrassFieldModal] = useState(false);
  const [grassFieldData, setGrassFieldData] = useState<Array<{ classId: string; className: string; grassByDate: Record<string, number> }>>([]);
  const [isLoadingGrassField, setIsLoadingGrassField] = useState(false);

  // 학생 상세 모달
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentGrassData, setStudentGrassData] = useState<Array<{ date: string; cookieChange: number; count: number }>>([]);

  // 프로필 확인 모달
  const [selectedProfileStudent, setSelectedProfileStudent] = useState<Student | null>(null);
  const [profileStudentGrass, setProfileStudentGrass] = useState<Array<{ date: string; cookieChange: number; count: number }>>([]);
  const [isLoadingProfileGrass, setIsLoadingProfileGrass] = useState(false);

  // 워드클라우드 모달
  const [showWordCloudModal, setShowWordCloudModal] = useState(false);

  // 캔디 부여
  const [cookieAmount, setCookieAmount] = useState('');
  const [isAddingCookie, setIsAddingCookie] = useState(false);

  // 전체 캔디 부여
  const [selectedForCookie, setSelectedForCookie] = useState<string[]>([]);
  const [bulkCookieAmount, setBulkCookieAmount] = useState('');
  const [isAddingBulkCookie, setIsAddingBulkCookie] = useState(false);
  const [showBulkCookieMode, setShowBulkCookieMode] = useState(false);

  // 상점 상태
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [isLoadingShop, setIsLoadingShop] = useState(false);
  const [isRegisteringDefaults, setIsRegisteringDefaults] = useState(false);
  const [isDeletingAllShop, setIsDeletingAllShop] = useState(false);
  const [showDeleteAllShopConfirm, setShowDeleteAllShopConfirm] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('emoji');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [shopCategoryFilter, setShopCategoryFilter] = useState<string>('all');

  // 상점 모드 (캔디/쿠키)
  const [shopMode, setShopMode] = useState<'candy' | 'cookie'>('candy');

  // 팀 탭 모드 (관리/현황)
  const [teamTabMode, setTeamTabMode] = useState<'manage' | 'status'>('manage');

  // 쿠키 상점 상태
  const [cookieShopItems, setCookieShopItems] = useState<CookieShopItem[]>([]);
  const [cookieShopRequests, setCookieShopRequests] = useState<CookieShopRequest[]>([]);
  const [isLoadingCookieShop, setIsLoadingCookieShop] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [newCookieItemName, setNewCookieItemName] = useState('');
  const [newCookieItemPrice, setNewCookieItemPrice] = useState('');
  const [newCookieItemDescription, setNewCookieItemDescription] = useState('');
  const [showCookieRequestModal, setShowCookieRequestModal] = useState(false);
  const [selectedCookieRequest, setSelectedCookieRequest] = useState<CookieShopRequest | null>(null);
  const [teacherResponse, setTeacherResponse] = useState('');

  // 물품 요청 (학생 → 교사) 상태
  const [itemSuggestions, setItemSuggestions] = useState<ItemSuggestion[]>([]);
  const [showItemSuggestionsModal, setShowItemSuggestionsModal] = useState(false);
  const [selectedItemSuggestion, setSelectedItemSuggestion] = useState<ItemSuggestion | null>(null);
  const [suggestionResponseMessage, setSuggestionResponseMessage] = useState('');

  // 팀 상태
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamFlag, setNewTeamFlag] = useState(TEAM_FLAGS[0]);
  const [selectedTeamForMember, setSelectedTeamForMember] = useState<string | null>(null);
  const [showTeamMemberModal, setShowTeamMemberModal] = useState(false);

  // 튜토리얼 모드일 때 팀이 없으면 더미 데이터 표시
  const displayTeams = runTutorial && teams.length === 0 ? TUTORIAL_DUMMY_TEAMS : teams;
  // 튜토리얼 모드일 때 더미 학생을 표시하면 더미 잔디 데이터도 표시
  const showingDummyStudents = runTutorial && students.length === 0;
  const displayGrassData = showingDummyStudents ? TUTORIAL_DUMMY_GRASS : grassData;
  const [teamForMemberModal, setTeamForMemberModal] = useState<string | null>(null);
  const [membersToAdd, setMembersToAdd] = useState<string[]>([]);
  const [membersToRemove, setMembersToRemove] = useState<string[]>([]);
  const [editingTeamName, setEditingTeamName] = useState('');
  const [editingTeamFlag, setEditingTeamFlag] = useState('');
  const [swapStudent1, setSwapStudent1] = useState<{ code: string; teamId: string } | null>(null);
  const [swapStudent2, setSwapStudent2] = useState<{ code: string; teamId: string } | null>(null);

  // 배틀 상태
  const [battles, setBattles] = useState<Battle[]>([]);
  const [isLoadingBattles, setIsLoadingBattles] = useState(false);
  const [newBattleTitle, setNewBattleTitle] = useState('');
  const [newBattleTeam1, setNewBattleTeam1] = useState('');
  const [newBattleTeam2, setNewBattleTeam2] = useState('');
  const [newBattleReward, setNewBattleReward] = useState('10');

  // 소원 상태
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [isLoadingWishes, setIsLoadingWishes] = useState(false);
  const [wishSortOrder, setWishSortOrder] = useState<'latest' | 'likes'>('latest');
  const [grantingWish, setGrantingWish] = useState<Wish | null>(null);
  const [grantMessage, setGrantMessage] = useState('');
  const [wishPage, setWishPage] = useState(1);
  const [wishGroupFilter, setWishGroupFilter] = useState<string | null>(null); // null = 전체 보기, string = 그룹 ID
  const WISHES_PER_PAGE = 20;

  // 튜토리얼 모드일 때 항상 더미 데이터 표시 (원래 데이터가 있어도)
  const displayWishes = runTutorial ? TUTORIAL_DUMMY_WISHES : wishes;

  // 팀 현황 상태
  const [teamStatusData, setTeamStatusData] = useState<Map<string, Array<{ date: string; cookieChange: number; count: number }>>>(new Map());
  const [isLoadingTeamStatus, setIsLoadingTeamStatus] = useState(false);

  // 숫자야구 게임 상태
  interface BaseballGame {
    id: string;
    teacherId: string;
    classId: string;
    digits: 4 | 5;
    answer: string;
    status: 'waiting' | 'playing' | 'finished';
    createdAt: any;
    completedCount: number;
    className?: string;
  }

  interface BaseballPlayer {
    code: string;
    name: string;
    joinedAt: any;
    solvedAt: any | null;
    rank: number | null;
    attempts: number;
  }

  const [baseballGame, setBaseballGame] = useState<BaseballGame | null>(null);
  const [baseballPlayers, setBaseballPlayers] = useState<BaseballPlayer[]>([]);
  const [baseballDigits, setBaseballDigits] = useState<4 | 5>(4);
  const [baseballEntryFee, setBaseballEntryFee] = useState(0); // 참가비
  const [isCreatingGame, setIsCreatingGame] = useState(false);
  const [showBaseballAnswer, setShowBaseballAnswer] = useState(false); // 정답 표시 토글
  const [expandedGame, setExpandedGame] = useState<string | null>(null); // 펼쳐진 게임
  const [showCookieBattleHelp, setShowCookieBattleHelp] = useState(false); // 쿠키배틀 도움말
  const [cookieBattleHelpPage, setCookieBattleHelpPage] = useState(0); // 도움말 페이지

  // 소수결게임 상태
  interface MinorityGame {
    id: string;
    teacherId: string;
    classId: string;
    status: 'waiting' | 'question' | 'result' | 'finished';
    currentRound: number;
    className?: string;
    createdAt: any;
  }

  const [minorityGame, setMinorityGame] = useState<MinorityGame | null>(null);
  const [isCreatingMinorityGame, setIsCreatingMinorityGame] = useState(false);
  const [minorityEntryFee, setMinorityEntryFee] = useState(0); // 소수결 참가비
  type MinorityGameMode = 'elimination' | 'score';
  const [minorityGameMode, setMinorityGameMode] = useState<MinorityGameMode>('elimination');

  // 소수결게임 생성
  const createMinorityGame = async () => {
    if (!user || !selectedClass) {
      toast.error('학급을 먼저 선택해주세요.');
      return;
    }

    setIsCreatingMinorityGame(true);
    try {
      const gameId = `minority_${user.uid}_${Date.now()}`;
      const currentClassName = classes?.find(c => c.id === selectedClass)?.name || '';

      const gameData = {
        teacherId: user.uid,
        classId: selectedClass,
        status: 'waiting' as const,
        currentRound: 0,
        currentQuestion: null,
        usedQuestions: [],
        createdAt: serverTimestamp(),
        className: currentClassName,
        entryFee: minorityEntryFee, // 참가비
        gameMode: minorityGameMode, // 게임 모드: elimination(탈락) 또는 score(점수)
        maxRounds: minorityGameMode === 'score' ? 10 : 0 // 점수 모드: 10라운드 고정
      };

      await setDoc(doc(db, 'games', gameId), gameData);

      // 교사용 게임 관리 창 열기
      const teacherGameUrl = `${window.location.origin}?game=minority-teacher&gameId=${gameId}`;
      window.open(teacherGameUrl, '_blank', 'width=800,height=900');

      toast.success('소수결게임이 생성되었습니다!');
    } catch (error) {
      console.error('Failed to create minority game:', error);
      toast.error('게임 생성에 실패했습니다.');
    }
    setIsCreatingMinorityGame(false);
  };

  // 소수결게임 삭제
  const deleteMinorityGame = async () => {
    if (!minorityGame) return;

    if (!confirm('정말 게임을 삭제하시겠습니까?')) return;

    try {
      // 플레이어 데이터 삭제
      const playersRef = collection(db, 'games', minorityGame.id, 'players');
      const playersSnap = await getDocs(playersRef);
      for (const playerDoc of playersSnap.docs) {
        await deleteDoc(playerDoc.ref);
      }

      // 게임 삭제
      await deleteDoc(doc(db, 'games', minorityGame.id));
      setMinorityGame(null);
      toast.success('게임이 삭제되었습니다.');
    } catch (error) {
      console.error('Failed to delete game:', error);
      toast.error('게임 삭제에 실패했습니다.');
    }
  };

  // 소수결게임 구독 (활성 게임 찾기)
  useEffect(() => {
    if (!user || !selectedClass) {
      setMinorityGame(null);
      return;
    }

    const gamesRef = collection(db, 'games');
    const unsubscribe = onSnapshot(gamesRef, (snapshot) => {
      let activeGame: MinorityGame | null = null;

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.teacherId === user.uid &&
            data.classId === selectedClass &&
            data.status !== 'finished' &&
            docSnap.id.startsWith('minority_')) {
          activeGame = { id: docSnap.id, ...data } as MinorityGame;
        }
      });

      setMinorityGame(activeGame);
    });

    return () => unsubscribe();
  }, [user, selectedClass]);

  // 총알피하기 상태
  interface BulletDodgeGame {
    id: string;
    teacherId: string;
    classId: string;
    status: 'waiting' | 'playing' | 'finished';
    className?: string;
    createdAt: any;
  }

  const [bulletDodgeGame, setBulletDodgeGame] = useState<BulletDodgeGame | null>(null);
  const [isCreatingBulletDodge, setIsCreatingBulletDodge] = useState(false);
  const [bulletDodgeEntryFee, setBulletDodgeEntryFee] = useState(0); // 총알피하기 참가비

  // 가위바위보 상태
  type RPSGameMode = 'survivor' | 'candy15' | 'candy12';
  interface RPSGame {
    id: string;
    teacherId: string;
    classId: string;
    status: 'waiting' | 'selecting' | 'result' | 'finished';
    gameMode: RPSGameMode;
    round: number;
    className?: string;
    createdAt: any;
  }

  const [rpsGame, setRpsGame] = useState<RPSGame | null>(null);
  const [isCreatingRps, setIsCreatingRps] = useState(false);
  const [selectedRpsMode, setSelectedRpsMode] = useState<RPSGameMode>('survivor');
  const [rpsEntryFee, setRpsEntryFee] = useState(0); // 가위바위보 참가비

  // 쿠키 배틀 상태
  interface CookieBattleGame {
    id: string;
    teacherId: string;
    classId: string;
    status: 'waiting' | 'betting' | 'result' | 'finished';
    round: number;
    className?: string;
    createdAt: any;
  }

  const [cookieBattleGame, setCookieBattleGame] = useState<CookieBattleGame | null>(null);
  const [isCreatingCookieBattle, setIsCreatingCookieBattle] = useState(false);
  type CookieBattleResourceMode = 'memberCount' | 'ownedCookie' | 'earnedCookie';
  const [selectedCookieBattleResourceMode, setSelectedCookieBattleResourceMode] = useState<CookieBattleResourceMode>('memberCount');

  // 끝말잇기 상태
  interface WordChainGame {
    id: string;
    teacherId: string;
    classId: string;
    status: 'waiting' | 'playing' | 'finished';
    gameMode: 'survival' | 'score';
    battleType: 'individual' | 'team';
    currentWord: string;
    currentRound: number;
    className?: string;
    createdAt: any;
  }

  const [wordChainGame, setWordChainGame] = useState<WordChainGame | null>(null);
  const [isCreatingWordChain, setIsCreatingWordChain] = useState(false);
  type WordChainGameMode = 'survival' | 'score';
  type WordChainBattleType = 'individual' | 'team';
  const [wordChainGameMode, setWordChainGameMode] = useState<WordChainGameMode>('survival');
  const [wordChainBattleType, setWordChainBattleType] = useState<WordChainBattleType>('individual');
  const [wordChainTimeLimit, setWordChainTimeLimit] = useState(15);
  const [wordChainMinLength, setWordChainMinLength] = useState(2);
  const [wordChainMaxLength, setWordChainMaxLength] = useState(10);
  const [wordChainBanKiller, setWordChainBanKiller] = useState(true);
  const [wordChainMaxRounds, setWordChainMaxRounds] = useState(10);

  // 총알피하기 게임 생성
  const createBulletDodgeGame = async () => {
    if (!user || !selectedClass) {
      toast.error('학급을 먼저 선택해주세요.');
      return;
    }

    setIsCreatingBulletDodge(true);
    try {
      const gameId = `bulletdodge_${user.uid}_${Date.now()}`;
      const currentClassName = classes?.find(c => c.id === selectedClass)?.name || '';

      const gameData = {
        teacherId: user.uid,
        classId: selectedClass,
        status: 'waiting' as const,
        createdAt: serverTimestamp(),
        className: currentClassName,
        entryFee: bulletDodgeEntryFee // 참가비
      };

      await setDoc(doc(db, 'games', gameId), gameData);

      // 교사용 게임 관리 창 열기
      const teacherGameUrl = `${window.location.origin}?game=bullet-dodge-teacher&gameId=${gameId}`;
      window.open(teacherGameUrl, '_blank', 'width=800,height=900');

      toast.success('총알피하기 게임이 생성되었습니다!');
    } catch (error) {
      console.error('Failed to create bullet dodge game:', error);
      toast.error('게임 생성에 실패했습니다.');
    }
    setIsCreatingBulletDodge(false);
  };

  // 총알피하기 삭제
  const deleteBulletDodgeGame = async () => {
    if (!bulletDodgeGame) return;

    if (!confirm('정말 게임을 삭제하시겠습니까?')) return;

    try {
      const playersRef = collection(db, 'games', bulletDodgeGame.id, 'players');
      const playersSnap = await getDocs(playersRef);
      for (const playerDoc of playersSnap.docs) {
        await deleteDoc(playerDoc.ref);
      }

      await deleteDoc(doc(db, 'games', bulletDodgeGame.id));
      setBulletDodgeGame(null);
      toast.success('게임이 삭제되었습니다.');
    } catch (error) {
      console.error('Failed to delete game:', error);
      toast.error('게임 삭제에 실패했습니다.');
    }
  };

  // 총알피하기 구독
  useEffect(() => {
    if (!user || !selectedClass) {
      setBulletDodgeGame(null);
      return;
    }

    const gamesRef = collection(db, 'games');
    const unsubscribe = onSnapshot(gamesRef, (snapshot) => {
      let activeGame: BulletDodgeGame | null = null;

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.teacherId === user.uid &&
            data.classId === selectedClass &&
            data.status !== 'finished' &&
            docSnap.id.startsWith('bulletdodge_')) {
          activeGame = { id: docSnap.id, ...data } as BulletDodgeGame;
        }
      });

      setBulletDodgeGame(activeGame);
    });

    return () => unsubscribe();
  }, [user, selectedClass]);

  // 가위바위보 게임 생성
  const createRpsGame = async () => {
    if (!user || !selectedClass) {
      toast.error('학급을 먼저 선택해주세요.');
      return;
    }

    setIsCreatingRps(true);
    try {
      const gameId = `rps_${user.uid}_${Date.now()}`;
      const currentClassName = classes?.find(c => c.id === selectedClass)?.name || '';

      const gameData = {
        teacherId: user.uid,
        classId: selectedClass,
        status: 'waiting' as const,
        gameMode: selectedRpsMode,
        teacherChoice: null,
        round: 0,
        showResult: false,
        createdAt: serverTimestamp(),
        className: currentClassName,
        entryFee: rpsEntryFee // 참가비
      };

      await setDoc(doc(db, 'games', gameId), gameData);

      // 교사용 게임 관리 창 열기
      const teacherGameUrl = `${window.location.origin}?game=rps-teacher&gameId=${gameId}`;
      window.open(teacherGameUrl, '_blank', 'width=800,height=900');

      toast.success('가위바위보 게임이 생성되었습니다!');
    } catch (error) {
      console.error('Failed to create RPS game:', error);
      toast.error('게임 생성에 실패했습니다.');
    }
    setIsCreatingRps(false);
  };

  // 가위바위보 삭제
  const deleteRpsGame = async () => {
    if (!rpsGame) return;

    if (!confirm('정말 게임을 삭제하시겠습니까?')) return;

    try {
      const playersRef = collection(db, 'games', rpsGame.id, 'players');
      const playersSnap = await getDocs(playersRef);
      for (const playerDoc of playersSnap.docs) {
        await deleteDoc(playerDoc.ref);
      }

      await deleteDoc(doc(db, 'games', rpsGame.id));
      setRpsGame(null);
      toast.success('게임이 삭제되었습니다.');
    } catch (error) {
      console.error('Failed to delete game:', error);
      toast.error('게임 삭제에 실패했습니다.');
    }
  };

  // 가위바위보 구독
  useEffect(() => {
    if (!user || !selectedClass) {
      setRpsGame(null);
      return;
    }

    const gamesRef = collection(db, 'games');
    const unsubscribe = onSnapshot(gamesRef, (snapshot) => {
      let activeGame: RPSGame | null = null;

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.teacherId === user.uid &&
            data.classId === selectedClass &&
            data.status !== 'finished' &&
            docSnap.id.startsWith('rps_')) {
          activeGame = { id: docSnap.id, ...data } as RPSGame;
        }
      });

      setRpsGame(activeGame);
    });

    return () => unsubscribe();
  }, [user, selectedClass]);

  // 쿠키 배틀 게임 생성
  const createCookieBattleGame = async () => {
    if (!user || !selectedClass) {
      toast.error('학급을 먼저 선택해주세요.');
      return;
    }

    setIsCreatingCookieBattle(true);
    try {
      // 팀 데이터 새로고침 (버튼 클릭 시 항상 최신 팀 데이터 로드)
      const freshTeams = await getTeams(user.uid, selectedClass);
      setTeams(freshTeams);

      // 팀이 2개 이상 있어야 함
      if (freshTeams.length < 2) {
        toast.error(`쿠키 배틀은 최소 2개 이상의 팀이 필요합니다. (현재 ${freshTeams.length}개)`);
        setIsCreatingCookieBattle(false);
        return;
      }

      const gameId = `cookiebattle_${user.uid}_${Date.now()}`;
      const currentClassName = classes?.find(c => c.id === selectedClass)?.name || '';
      const today = getKoreanDateString(new Date());

      // 자원 계산을 위한 학생 쿠키 맵
      const studentDataMap = new Map<string, { name: string; number: number; jelly: number; hasReflected: boolean }>();

      // 축적 기간 시작일 (가장 오래된 팀 결성일)
      let accumulationStartDate = today;
      freshTeams.forEach(team => {
        if (team.createdAt) {
          const teamDate = team.createdAt.toDate ?
            team.createdAt.toDate().toISOString().split('T')[0] :
            today;
          if (teamDate < accumulationStartDate) {
            accumulationStartDate = teamDate;
          }
        }
      });

      // 각 학생의 잔디 데이터 확인 (축적 기간 동안 성찰 여부)
      for (const student of students) {
        let hasReflected = false;
        try {
          const grassData = await getGrassData(user.uid, student.code);
          // 축적 기간 동안 하루라도 잔디가 있으면 성찰한 것으로 간주
          if (grassData) {
            hasReflected = Object.keys(grassData).some(date =>
              date >= accumulationStartDate && date <= today && grassData[date] > 0
            );
          }
        } catch (e) {
          console.error('Failed to get grass data for', student.code);
        }

        studentDataMap.set(student.code, {
          name: student.name,
          number: student.number ?? 0,
          jelly: student.jelly ?? student.cookie ?? 0,
          hasReflected
        });
      }

      // 게임 문서 생성
      const gameData = {
        teacherId: user.uid,
        classId: selectedClass,
        gameType: 'cookieBattle',
        status: 'waiting' as const,
        resourceMode: selectedCookieBattleResourceMode,
        round: 0,
        createdAt: serverTimestamp(),
        className: currentClassName,
        accumulationStartDate,
        battleLog: [],
        battleResults: []
      };

      await setDoc(doc(db, 'games', gameId), gameData);

      // 각 팀을 subcollection으로 생성
      for (const team of freshTeams) {
        // 자원 모드에 따른 초기 자원 계산
        let initialResources = 0;
        if (selectedCookieBattleResourceMode === 'memberCount') {
          initialResources = team.members.length * 100;
        } else if (selectedCookieBattleResourceMode === 'ownedCookie') {
          initialResources = team.members.reduce((sum, memberCode) => {
            return sum + (studentDataMap.get(memberCode)?.jelly || 0);
          }, 0);
        } else if (selectedCookieBattleResourceMode === 'earnedCookie') {
          initialResources = team.teamCookie || 0;
        }

        const teamDoc = {
          name: team.teamName,
          emoji: team.flag,
          resources: initialResources,
          initialResources: initialResources,
          members: team.members,
          representativeCode: null,
          attackBet: 0,
          defenseBet: 0,
          targetTeamId: null,
          isEliminated: false,
          isReady: false
        };

        await setDoc(doc(db, 'games', gameId, 'teams', team.teamId), teamDoc);
      }

      // 학생 정보도 subcollection으로 저장 (성찰 여부 포함)
      for (const [code, data] of studentDataMap) {
        const teamId = freshTeams.find(t => t.members.includes(code))?.teamId || '';
        if (teamId) {
          await setDoc(doc(db, 'games', gameId, 'studentInfo', code), {
            name: data.name,
            number: data.number,
            teamId,
            jelly: data.jelly,
            hasReflected: data.hasReflected,
            isOnline: false
          });
        }
      }

      // 교사용 게임 관리 창 열기
      const teacherGameUrl = `${window.location.origin}?game=cookie-battle-teacher&gameId=${gameId}`;
      window.open(teacherGameUrl, '_blank', 'width=1200,height=900');

      toast.success('쿠키 배틀 게임이 생성되었습니다!');
    } catch (error) {
      console.error('Failed to create cookie battle game:', error);
      toast.error('게임 생성에 실패했습니다.');
    }
    setIsCreatingCookieBattle(false);
  };

  // 쿠키 배틀 삭제
  const deleteCookieBattleGame = async () => {
    if (!cookieBattleGame) return;

    if (!confirm('정말 게임을 삭제하시겠습니까?')) return;

    try {
      const playersRef = collection(db, 'games', cookieBattleGame.id, 'players');
      const playersSnap = await getDocs(playersRef);
      for (const playerDoc of playersSnap.docs) {
        await deleteDoc(playerDoc.ref);
      }

      await deleteDoc(doc(db, 'games', cookieBattleGame.id));
      setCookieBattleGame(null);
      toast.success('게임이 삭제되었습니다.');
    } catch (error) {
      console.error('Failed to delete game:', error);
      toast.error('게임 삭제에 실패했습니다.');
    }
  };

  // 쿠키 배틀 구독
  useEffect(() => {
    if (!user || !selectedClass) {
      setCookieBattleGame(null);
      return;
    }

    const gamesRef = collection(db, 'games');
    const unsubscribe = onSnapshot(gamesRef, (snapshot) => {
      let activeGame: CookieBattleGame | null = null;

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.teacherId === user.uid &&
            data.classId === selectedClass &&
            data.status !== 'finished' &&
            docSnap.id.startsWith('cookiebattle_')) {
          activeGame = { id: docSnap.id, ...data } as CookieBattleGame;
        }
      });

      setCookieBattleGame(activeGame);
    });

    return () => unsubscribe();
  }, [user, selectedClass]);

  // 끝말잇기 게임 생성
  const createWordChainGame = async () => {
    if (!user || !selectedClass) {
      toast.error('학급을 먼저 선택해주세요.');
      return;
    }

    setIsCreatingWordChain(true);
    try {
      const gameId = `wordchain_${user.uid}_${Date.now()}`;
      const currentClassName = classes?.find(c => c.id === selectedClass)?.name || '';

      const gameData: Record<string, unknown> = {
        teacherId: user.uid,
        classId: selectedClass,
        status: 'waiting' as const,
        gameMode: wordChainGameMode,
        battleType: wordChainBattleType,
        currentWord: '',
        currentTurnIndex: 0,
        turnOrder: [] as string[],
        usedWords: [] as string[],
        timeLimit: wordChainTimeLimit,
        minLength: wordChainMinLength,
        maxLength: wordChainMaxLength,
        banKillerWords: wordChainBanKiller,
        currentRound: 1,
        createdAt: serverTimestamp(),
        className: currentClassName,
      };

      // 점수모드일 때만 maxRounds 추가 (Firebase는 undefined 허용 안함)
      if (wordChainGameMode === 'score') {
        gameData.maxRounds = wordChainMaxRounds;
      }

      await setDoc(doc(db, 'games', gameId), gameData);

      // 교사용 게임 관리 창 열기
      const teacherGameUrl = `${window.location.origin}?game=word-chain-teacher&gameId=${gameId}`;
      window.open(teacherGameUrl, '_blank', 'width=800,height=900');

      toast.success('끝말잇기 게임이 생성되었습니다!');
    } catch (error) {
      console.error('Failed to create word chain game:', error);
      toast.error('게임 생성에 실패했습니다.');
    }
    setIsCreatingWordChain(false);
  };

  // 끝말잇기 삭제
  const deleteWordChainGame = async () => {
    if (!wordChainGame) return;

    if (!confirm('정말 게임을 삭제하시겠습니까?')) return;

    try {
      // 플레이어 데이터 삭제
      const playersRef = collection(db, 'games', wordChainGame.id, 'players');
      const playersSnap = await getDocs(playersRef);
      for (const playerDoc of playersSnap.docs) {
        await deleteDoc(playerDoc.ref);
      }

      // 히스토리 삭제
      await deleteDoc(doc(db, 'games', wordChainGame.id, 'history', 'words'));

      // 게임 삭제
      await deleteDoc(doc(db, 'games', wordChainGame.id));
      setWordChainGame(null);
      toast.success('게임이 삭제되었습니다.');
    } catch (error) {
      console.error('Failed to delete game:', error);
      toast.error('게임 삭제에 실패했습니다.');
    }
  };

  // 끝말잇기 구독
  useEffect(() => {
    if (!user || !selectedClass) {
      setWordChainGame(null);
      return;
    }

    const gamesRef = collection(db, 'games');
    const unsubscribe = onSnapshot(gamesRef, (snapshot) => {
      let activeGame: WordChainGame | null = null;

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.teacherId === user.uid &&
            data.classId === selectedClass &&
            data.status !== 'finished' &&
            docSnap.id.startsWith('wordchain_')) {
          activeGame = { id: docSnap.id, ...data } as WordChainGame;
        }
      });

      setWordChainGame(activeGame);
    });

    return () => unsubscribe();
  }, [user, selectedClass]);

  // 모든 클래스의 모든 게임 닫기
  const closeAllGames = async () => {
    if (!user) return;

    if (!confirm('정말 모든 클래스의 모든 게임을 닫으시겠습니까?\n(숫자야구, 소수결, 총알피하기, 가위바위보 게임이 모두 삭제됩니다)')) return;

    try {
      const gamesRef = collection(db, 'games');
      const snapshot = await getDocs(gamesRef);

      let deletedCount = 0;
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        // 이 교사가 만든 게임만 삭제
        if (data.teacherId === user.uid) {
          // 플레이어 데이터 삭제
          const playersRef = collection(db, 'games', docSnap.id, 'players');
          const playersSnap = await getDocs(playersRef);
          for (const playerDoc of playersSnap.docs) {
            await deleteDoc(playerDoc.ref);
          }

          // 라운드 데이터 삭제 (소수결게임용)
          if (docSnap.id.startsWith('minority_')) {
            const roundsRef = collection(db, 'games', docSnap.id, 'rounds');
            const roundsSnap = await getDocs(roundsRef);
            for (const roundDoc of roundsSnap.docs) {
              await deleteDoc(roundDoc.ref);
            }
          }

          // 게임 삭제
          await deleteDoc(docSnap.ref);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        toast.success(`${deletedCount}개의 게임이 삭제되었습니다.`);
      } else {
        toast.info('삭제할 게임이 없습니다.');
      }

      // 상태 초기화
      setBaseballGame(null);
      setMinorityGame(null);
      setBulletDodgeGame(null);
      setRpsGame(null);
      setWordChainGame(null);
    } catch (error) {
      console.error('Failed to close all games:', error);
      toast.error('게임 닫기에 실패했습니다.');
    }
  };

  // 숫자야구 게임 생성
  const generateNonRepeatingNumber = (digits: number): string => {
    const available = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    let result = '';

    // 첫 자리는 0이 아니어야 함
    const firstIndex = Math.floor(Math.random() * 9) + 1;
    result += available[firstIndex];
    available.splice(firstIndex, 1);

    // 나머지 자리
    for (let i = 1; i < digits; i++) {
      const index = Math.floor(Math.random() * available.length);
      result += available[index];
      available.splice(index, 1);
    }

    return result;
  };

  const createBaseballGame = async () => {
    if (!user || !selectedClass) {
      toast.error('학급을 먼저 선택해주세요.');
      return;
    }

    setIsCreatingGame(true);
    try {
      const gameId = `baseball_${user.uid}_${Date.now()}`;
      const answer = generateNonRepeatingNumber(baseballDigits);
      const currentClassName = classes?.find(c => c.id === selectedClass)?.name || '';

      const gameData = {
        teacherId: user.uid,
        classId: selectedClass,
        digits: baseballDigits,
        answer,
        status: 'waiting' as const,
        createdAt: serverTimestamp(),
        completedCount: 0,
        className: currentClassName,
        entryFee: baseballEntryFee // 참가비
      };

      await setDoc(doc(db, 'games', gameId), gameData);

      // 교사용 게임 관리 창 열기
      const teacherGameUrl = `${window.location.origin}?game=baseball-teacher&gameId=${gameId}`;
      window.open(teacherGameUrl, '_blank', 'width=800,height=900');

      toast.success(`${baseballDigits}자리 숫자야구 게임이 생성되었습니다!`);
    } catch (error) {
      console.error('Failed to create baseball game:', error);
      toast.error('게임 생성에 실패했습니다.');
    }
    setIsCreatingGame(false);
  };

  const startBaseballGame = async () => {
    if (!baseballGame) return;

    try {
      await updateDoc(doc(db, 'games', baseballGame.id), {
        status: 'playing'
      });
      toast.success('게임이 시작되었습니다!');
    } catch (error) {
      console.error('Failed to start game:', error);
      toast.error('게임 시작에 실패했습니다.');
    }
  };

  const endBaseballGame = async () => {
    if (!baseballGame) return;

    try {
      await updateDoc(doc(db, 'games', baseballGame.id), {
        status: 'finished'
      });
      toast.success('게임이 종료되었습니다!');
    } catch (error) {
      console.error('Failed to end game:', error);
      toast.error('게임 종료에 실패했습니다.');
    }
  };

  const deleteBaseballGame = async () => {
    if (!baseballGame) return;

    if (!confirm('정말 게임을 삭제하시겠습니까?')) return;

    try {
      // 플레이어 데이터 삭제
      const playersRef = collection(db, 'games', baseballGame.id, 'players');
      const playersSnap = await getDocs(playersRef);
      for (const playerDoc of playersSnap.docs) {
        await deleteDoc(playerDoc.ref);
      }

      // 게임 삭제
      await deleteDoc(doc(db, 'games', baseballGame.id));
      setBaseballGame(null);
      setBaseballPlayers([]);
      toast.success('게임이 삭제되었습니다.');
    } catch (error) {
      console.error('Failed to delete game:', error);
      toast.error('게임 삭제에 실패했습니다.');
    }
  };

  // 숫자야구 게임 구독 (활성 게임 찾기)
  useEffect(() => {
    if (!user || !selectedClass) {
      setBaseballGame(null);
      setBaseballPlayers([]);
      return;
    }

    // 현재 선택된 학급의 활성 게임 찾기
    const gamesRef = collection(db, 'games');
    const unsubscribe = onSnapshot(gamesRef, (snapshot) => {
      let activeGame: BaseballGame | null = null;

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.teacherId === user.uid &&
            data.classId === selectedClass &&
            data.status !== 'finished') {
          activeGame = { id: docSnap.id, ...data } as BaseballGame;
        }
      });

      setBaseballGame(activeGame);
    });

    return () => unsubscribe();
  }, [user, selectedClass]);

  // 숫자야구 플레이어 구독
  useEffect(() => {
    if (!baseballGame) {
      setBaseballPlayers([]);
      return;
    }

    const playersRef = collection(db, 'games', baseballGame.id, 'players');
    const unsubscribe = onSnapshot(playersRef, (snapshot) => {
      const players: BaseballPlayer[] = [];
      snapshot.docs.forEach(docSnap => {
        players.push({ code: docSnap.id, ...docSnap.data() } as BaseballPlayer);
      });

      // 순위 순으로 정렬 (맞춘 사람 우선, 그 다음 참가 순서)
      players.sort((a, b) => {
        if (a.rank && b.rank) return a.rank - b.rank;
        if (a.rank) return -1;
        if (b.rank) return 1;
        return 0;
      });

      setBaseballPlayers(players);
    });

    return () => unsubscribe();
  }, [baseballGame]);

  const handleAddStudent = async () => {
    if (!user || !selectedClass || !teacher) {
      toast.error('학급을 먼저 선택해주세요.');
      return;
    }

    if (!newStudentNumber || !newStudentName || !newStudentCode) {
      toast.error('모든 항목을 입력해주세요.');
      return;
    }

    setIsAddingStudent(true);
    try {
      // 다했니 API에서 현재 쿠키 정보 가져오기
      let initialData = { cookie: 0, usedCookie: 0, totalCookie: 0, chocoChips: 0, badges: {} as Record<string, Badge> };
      try {
        initialData = await fetchStudentFromDahandin(teacher.dahandinApiKey, newStudentCode.trim());
      } catch (apiError) {
        console.log('다했니 API 조회 실패 - 기본값 사용:', apiError);
      }

      await createStudent(user.uid, selectedClass, {
        code: newStudentCode.trim(),
        number: parseInt(newStudentNumber),
        name: newStudentName.trim(),
        cookie: initialData.cookie,
        usedCookie: initialData.usedCookie,
        totalCookie: initialData.totalCookie,
        chocoChips: initialData.chocoChips,
        previousCookie: initialData.cookie, // 등록 시점의 쿠키
        initialCookie: initialData.cookie,  // 등록 시점의 쿠키 (잔디 계산용)
        profile: {
          emojiCode: 'emoji_00',
          title: '',
          titleColorCode: 'title_00',
          borderCode: 'border_00',
          nameEffectCode: 'name_00',
          backgroundCode: 'bg_00'
        },
        ownedItems: [],
        badges: initialData.badges
      });

      await loadStudents();
      setNewStudentNumber('');
      setNewStudentName('');
      setNewStudentCode('');
      toast.success('학생이 추가되었습니다!');
    } catch (error) {
      console.error('Failed to add student:', error);
      toast.error('학생 추가에 실패했습니다.');
    }
    setIsAddingStudent(false);
  };

  // XLSX 파일 업로드 처리 (다했니 웹에서 다운로드한 파일 - D열이 학생코드)
  const handleXlsxUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user || !selectedClass) {
      toast.error('학급을 먼저 선택해주세요.');
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingCsv(true);
    try {
      const parsedCodes = await parseXlsxFile(file);

      let successCount = 0;
      let skipCount = 0;
      let errorCount = 0;

      for (let i = 0; i < parsedCodes.length; i++) {
        const studentCode = parsedCodes[i].code;
        const studentName = parsedCodes[i].name;
        try {
          // 중복 확인
          const existingStudent = await getStudent(user.uid, studentCode);
          if (existingStudent) {
            skipCount++;
            continue; // 이미 존재하는 학생은 건너뛰기
          }

          await createStudent(user.uid, selectedClass, {
            code: studentCode,
            number: i + 1, // 순서대로 번호 부여
            name: studentName, // XLSX B열에서 추출한 이름
            cookie: 0,
            usedCookie: 0,
            totalCookie: 0,
            chocoChips: 0,
            previousCookie: 0,
            initialCookie: 0, // 이후 refreshStudentCookies에서 설정됨
            profile: {
              emojiCode: 'emoji_00',
              title: '',
              titleColorCode: 'title_00',
              borderCode: 'border_00',
              nameEffectCode: 'name_00',
              backgroundCode: 'bg_00'
            },
            ownedItems: []
          });
          successCount++;
        } catch (err) {
          console.error(`Failed to add student code ${studentCode}:`, err);
          errorCount++;
        }
      }

      // 학생 목록 및 학급 정보 새로고침
      await loadStudents();
      await refreshClasses();

      if (skipCount > 0 && errorCount > 0) {
        toast.warning(`${successCount}명 추가, ${skipCount}명 중복(건너뜀), ${errorCount}명 실패`);
      } else if (skipCount > 0) {
        toast.success(`${successCount}명 추가, ${skipCount}명 중복(건너뜀)`);
      } else if (errorCount > 0) {
        toast.warning(`${successCount}명 추가, ${errorCount}명 실패`);
      } else {
        toast.success(`${successCount}명의 학생을 추가했습니다!`);
      }

      // 새로 추가된 학생이 있으면 쿠키 정보 자동 불러오기 (이름도 업데이트됨)
      if (successCount > 0 && teacher) {
        toast.info('학생 정보를 불러오는 중...');
        try {
          const result = await refreshStudentCookies(user.uid, selectedClass, teacher.dahandinApiKey);
          await loadStudents();
          if (result.success) {
            toast.success(`${result.count}명의 정보를 불러왔습니다!`);
          }
        } catch (refreshError) {
          console.error('Failed to auto-refresh cookies:', refreshError);
          toast.error('학생 정보 자동 불러오기에 실패했습니다. 수동으로 새로고침해주세요.');
        }
      }
    } catch (error: any) {
      console.error('XLSX upload error:', error);
      toast.error(error.message || 'XLSX 파일 처리에 실패했습니다.');
    }
    setIsUploadingCsv(false);

    // 파일 입력 초기화
    e.target.value = '';
  };

  // CSV 템플릿 다운로드
  const handleDownloadTemplate = () => {
    const className = classes.find((c: ClassInfo) => c.id === selectedClass)?.name || '학급';
    downloadCsvTemplate(className);
  };

  // 학생 목록 CSV 내보내기
  const handleExportStudents = () => {
    if (students.length === 0) {
      toast.error('내보낼 학생이 없습니다.');
      return;
    }
    const className = classes.find((c: ClassInfo) => c.id === selectedClass)?.name || '학급';
    const exportData = students.map((s: Student) => ({
      number: s.number,
      name: s.name,
      code: s.code
    }));
    exportStudentsToCsv(exportData, className);
    toast.success('학생 목록을 내보냈습니다.');
  };

  // 학생 전체 초기화
  const handleResetStudents = async () => {
    if (!user || !selectedClass) return;

    setIsResettingStudents(true);
    try {
      const deletedCount = await deleteAllStudents(user.uid, selectedClass);
      await loadStudents();
      await refreshClasses();
      toast.success(`${deletedCount}명의 학생이 삭제되었습니다.`);
    } catch (error) {
      console.error('Failed to reset students:', error);
      toast.error('학생 초기화에 실패했습니다.');
    }
    setIsResettingStudents(false);
    setShowResetConfirm(false);
  };

  // 학생 상세 보기
  const handleStudentDoubleClick = async (student: Student) => {
    setSelectedStudent(student);
    if (user && selectedClass) {
      try {
        const grass = await getGrassData(user.uid, selectedClass, student.code);
        setStudentGrassData(grass.map(g => ({ date: g.date, cookieChange: g.cookieChange, count: g.count })));
      } catch (error) {
        console.error('Failed to load student grass:', error);
      }
    }
  };

  // 학생 상세 모달 닫기
  const handleCloseStudentModal = () => {
    setSelectedStudent(null);
    setStudentGrassData([]);
    setCookieAmount('');
  };

  // 캔디 부여 (직접 금액 지정 또는 입력값 사용)
  const handleAddCookie = async (directAmount?: number) => {
    if (!user || !selectedStudent) return;

    const amount = directAmount !== undefined ? directAmount : parseInt(cookieAmount);
    if (isNaN(amount) || amount === 0) {
      toast.error('부여할 캔디 수를 입력해주세요.');
      return;
    }

    setIsAddingCookie(true);
    try {
      await addCookiesToStudent(user.uid, selectedStudent.code, amount);

      // 학생 정보 새로고침
      const updatedStudent = await getStudent(user.uid, selectedStudent.code);
      if (updatedStudent) {
        setSelectedStudent(updatedStudent);
      }
      await loadStudents();

      setCookieAmount('');
      toast.success(`${selectedStudent.name}에게 ${amount > 0 ? '+' : ''}${amount}🍭 ${amount > 0 ? '부여' : '차감'}!`);
    } catch (error) {
      console.error('Failed to add cookie:', error);
      toast.error('캔디 부여에 실패했습니다.');
    }
    setIsAddingCookie(false);
  };

  // 선택된 학생들에게 캔디 전체 부여
  const handleBulkAddCookie = async () => {
    if (!user || selectedForCookie.length === 0) {
      toast.error('캔디를 부여할 학생을 선택해주세요.');
      return;
    }

    const amount = parseInt(bulkCookieAmount);
    if (isNaN(amount) || amount === 0) {
      toast.error('부여할 캔디 수를 입력해주세요.');
      return;
    }

    setIsAddingBulkCookie(true);
    let successCount = 0;
    try {
      for (const studentCode of selectedForCookie) {
        await addCookiesToStudent(user.uid, studentCode, amount);
        successCount++;
      }
      await loadStudents();
      setBulkCookieAmount('');
      setSelectedForCookie([]);
      setShowBulkCookieMode(false);
      toast.success(`${successCount}명에게 ${amount > 0 ? '+' : ''}${amount}🍭 ${amount > 0 ? '부여' : '차감'}!`);
    } catch (error) {
      console.error('Failed to add bulk cookie:', error);
      toast.error(`캔디 부여 중 오류 (${successCount}명 완료)`);
    }
    setIsAddingBulkCookie(false);
  };

  // 전체 선택/해제
  const handleSelectAllForCookie = (checked: boolean) => {
    if (checked) {
      setSelectedForCookie(students.map(s => s.code));
    } else {
      setSelectedForCookie([]);
    }
  };

  // 개별 학생 선택/해제
  const handleSelectStudentForCookie = (code: string, checked: boolean) => {
    if (checked) {
      setSelectedForCookie(prev => [...prev, code]);
    } else {
      setSelectedForCookie(prev => prev.filter(c => c !== code));
    }
  };

  // 잔디 색상 (3단계: 1개, 2개, 3개 이상)
  const getStudentGrassColor = (cookieChange: number) => {
    if (cookieChange === 0) return 'bg-gray-200'; // 없음
    if (cookieChange === 1) return 'bg-green-300'; // 1개
    if (cookieChange === 2) return 'bg-green-500'; // 2개
    return 'bg-green-700'; // 3개 이상
  };

  // 최근 10일 잔디 (평일만, 한국 시간 기준, 최신순)
  const getStudentLast14Days = () => {
    return getLastWeekdaysWithData(10, studentGrassData);
  };

  // 잔디 데이터 로드
  const loadGrassData = async () => {
    if (!user || !selectedClass) return;

    setIsLoadingGrass(true);
    try {
      // UTC 기준 어제로 저장된 잔디를 오늘로 자동 이동
      await migrateGrassDateToToday(user.uid, selectedClass);
      const data = await getGrassData(user.uid, selectedClass);
      setGrassData(data);
    } catch (error) {
      console.error('Failed to load grass data:', error);
      toast.error('잔디 데이터를 불러오는데 실패했습니다.');
    }
    setIsLoadingGrass(false);
  };

  // 학급 선택 시 잔디 데이터 자동 로드
  useEffect(() => {
    if (selectedClass && user) {
      loadGrassData();
    }
  }, [selectedClass, user]);

  // 잔디 데이터 초기화
  const handleResetGrass = async () => {
    if (!user || !selectedClass) return;

    if (!confirm('정말로 잔디 데이터를 모두 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
      return;
    }

    setIsResettingGrass(true);
    try {
      const result = await resetGrassData(user.uid, selectedClass);
      setGrassData([]);
      toast.success(`잔디 데이터 ${result.deletedCount}개가 초기화되었습니다.`);
    } catch (error) {
      console.error('Failed to reset grass data:', error);
      toast.error('잔디 초기화에 실패했습니다.');
    }
    setIsResettingGrass(false);
  };

  // 과거 잔디 엑셀 업로드
  const handlePastGrassUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !user || !selectedClass) return;

    setIsUploadingPastGrass(true);
    let totalAdded = 0;
    let totalSkipped = 0;
    const notFoundNames: string[] = [];

    try {
      for (const file of Array.from(files)) {
        const grassDataList = await parsePastGrassXlsx(file, pastGrassYear);

        for (const item of grassDataList) {
          // 이름으로 학생 찾기
          const student = students.find(s => s.name === item.name);
          if (!student) {
            if (!notFoundNames.includes(item.name)) {
              notFoundNames.push(item.name);
            }
            totalSkipped++;
            continue;
          }

          // 잔디 데이터 추가
          await addGrassRecordForDate(
            user.uid,
            selectedClass,
            student.code,
            item.date,
            item.cookies
          );
          totalAdded++;
        }
      }

      // 결과 메시지
      let message = `✅ ${totalAdded}개의 잔디 기록이 추가되었습니다.`;
      if (totalSkipped > 0) {
        message += `\n⚠️ ${totalSkipped}개 스킵됨`;
        if (notFoundNames.length > 0) {
          message += ` (찾을 수 없는 학생: ${notFoundNames.slice(0, 5).join(', ')}${notFoundNames.length > 5 ? '...' : ''})`;
        }
      }
      toast.success(message);

      // 잔디 데이터 새로고침
      await loadGrassData();
    } catch (error) {
      console.error('Failed to upload past grass:', error);
      toast.error(error instanceof Error ? error.message : '과거 잔디 업로드에 실패했습니다.');
    }

    setIsUploadingPastGrass(false);
  };

  // 반별 잔디밭 데이터 로드
  const loadGrassFieldData = async () => {
    if (!user || !classes || classes.length === 0) return;

    setIsLoadingGrassField(true);
    try {
      const classesGrassData: Array<{ classId: string; className: string; grassByDate: Record<string, number> }> = [];

      // 숨겨지지 않은 모든 반의 잔디 데이터 로드
      const visibleClasses = classes.filter((c: ClassInfo) => !hiddenClasses.includes(c.id));

      for (const cls of visibleClasses) {
        const grassDataForClass = await getGrassData(user.uid, cls.id);

        // 날짜별로 쿠키 증가량 합산
        const grassByDate: Record<string, number> = {};

        grassDataForClass.forEach(item => {
          if (!grassByDate[item.date]) {
            grassByDate[item.date] = 0;
          }
          // 쿠키 증가량으로 집계
          grassByDate[item.date] += item.cookieChange || 0;
        });

        classesGrassData.push({
          classId: cls.id,
          className: cls.name,
          grassByDate
        });
      }

      setGrassFieldData(classesGrassData);
      setShowGrassFieldModal(true);
    } catch (error) {
      console.error('Failed to load grass field data:', error);
      toast.error('잔디밭 데이터를 불러오는데 실패했습니다.');
    }
    setIsLoadingGrassField(false);
  };

  // 잔디 데이터를 날짜별로 그룹화 (튜토리얼 모드면 더미 데이터 사용)
  const getGrassByDate = () => {
    const grouped: Record<string, Record<string, { change: number; count: number }>> = {};
    displayGrassData.forEach((item: { date: string; studentCode: string; cookieChange: number; count: number }) => {
      if (!grouped[item.date]) {
        grouped[item.date] = {};
      }
      grouped[item.date][item.studentCode] = {
        change: item.cookieChange,
        count: item.count
      };
    });
    return grouped;
  };

  // 최근 10일 날짜 목록 (평일만, 한국 시간 기준, 최신순)
  const getLast14Days = () => {
    return getLastWeekdays(10, grassOffset);
  };

  // 카테고리 정규화 (이전 카테고리를 새 카테고리로 매핑)
  const normalizeCategory = (category: string): string => {
    if (category === 'titlePermit' || category === 'profilePhoto') {
      return 'custom';
    }
    return category;
  };

  // ========== 상점 핸들러 ==========
  const loadShopItems = async () => {
    if (!user) return;
    setIsLoadingShop(true);
    try {
      const items = await getTeacherShopItems(user.uid);
      // 카테고리 정규화 적용
      const normalizedItems = items.map(item => ({
        ...item,
        category: normalizeCategory(item.category) as typeof item.category
      }));
      setShopItems(normalizedItems);
    } catch (error) {
      console.error('Failed to load shop items:', error);
    }
    setIsLoadingShop(false);
  };

  const handleAddShopItem = async () => {
    if (!user) return;
    if (!newItemName || !newItemPrice) {
      toast.error('상품명과 가격을 입력해주세요.');
      return;
    }
    try {
      await addShopItem(user.uid, {
        name: newItemName,
        price: parseInt(newItemPrice),
        category: newItemCategory,
        description: newItemDescription,
        value: newItemDescription || newItemName
      });
      setNewItemName('');
      setNewItemPrice('');
      setNewItemDescription('');
      await loadShopItems();
      toast.success('상품이 추가되었습니다!');
    } catch (error) {
      toast.error('상품 추가에 실패했습니다.');
    }
  };

  const handleDeleteShopItem = async (itemCode: string) => {
    if (!user) return;
    try {
      await deleteShopItem(user.uid, itemCode);
      await loadShopItems();
      toast.success('상품이 삭제되었습니다.');
    } catch (error) {
      toast.error('상품 삭제에 실패했습니다.');
    }
  };

  // 상점 전체 삭제
  const handleDeleteAllShopItems = async () => {
    if (!user) return;

    setIsDeletingAllShop(true);
    try {
      const deletedCount = await deleteAllShopItems(user.uid);
      await loadShopItems();
      toast.success(`${deletedCount}개의 상품이 삭제되었습니다.`);
    } catch (error) {
      console.error('Failed to delete all shop items:', error);
      toast.error('상품 전체 삭제에 실패했습니다.');
    }
    setIsDeletingAllShop(false);
    setShowDeleteAllShopConfirm(false);
  };

  // 기본 상품 일괄 등록 (중복 방지)
  const handleRegisterDefaultItems = async () => {
    if (!user) return;

    setIsRegisteringDefaults(true);
    try {
      // 기존 상품 코드 목록 가져오기
      const existingCodes = new Set(shopItems.map(item => item.code));

      let count = 0;
      for (const item of ALL_SHOP_ITEMS) {
        // 이미 존재하는 상품은 건너뛰기
        if (existingCodes.has(item.code)) {
          continue;
        }

        await addShopItem(user.uid, {
          code: item.code,  // 원래 코드 유지
          name: item.name,
          price: item.price,
          category: item.category,
          description: item.description || '',
          value: item.value
        });
        count++;
      }
      await loadShopItems();

      if (count > 0) {
        toast.success(`${count}개의 새로운 상품이 등록되었습니다!`);
      } else {
        toast.info('모든 기본 상품이 이미 등록되어 있습니다.');
      }
    } catch (error) {
      console.error('Failed to register default items:', error);
      toast.error('기본 상품 등록에 실패했습니다.');
    }
    setIsRegisteringDefaults(false);
  };

  // 상점 아이템 가격 수정
  const handleUpdateItemPrice = async (itemCode: string, newPrice: number) => {
    if (!user) return;
    try {
      await updateShopItem(user.uid, itemCode, { price: newPrice });
      await loadShopItems();
      toast.success('가격이 수정되었습니다!');
    } catch (error) {
      toast.error('가격 수정에 실패했습니다.');
    }
  };

  // ========== 쿠키 상점 핸들러 ==========
  // 쿠키 상점 로드 (전체 클래스 공유)
  const loadCookieShopItems = async () => {
    if (!user) return;
    setIsLoadingCookieShop(true);
    try {
      const items = await getCookieShopItems(user.uid);
      setCookieShopItems(items);
    } catch (error) {
      console.error('Failed to load cookie shop items:', error);
    }
    setIsLoadingCookieShop(false);
  };

  // 쿠키 상점 신청 로드 (전체 클래스 공유)
  const loadCookieShopRequests = async () => {
    if (!user) return;
    try {
      const requests = await getCookieShopRequests(user.uid);
      setCookieShopRequests(requests);
      setPendingRequestsCount(requests.filter(r => r.status === 'pending').length);
    } catch (error) {
      console.error('Failed to load cookie shop requests:', error);
    }
  };

  // 물품 요청 로드 (학생 → 교사)
  const loadItemSuggestions = async () => {
    if (!user) return;
    try {
      const suggestions = await getItemSuggestions(user.uid);
      setItemSuggestions(suggestions);
    } catch (error) {
      console.error('Failed to load item suggestions:', error);
    }
  };

  // 물품 요청 처리 (승인/거절)
  const handleSuggestionResponse = async (
    suggestion: ItemSuggestion,
    status: 'approved' | 'rejected',
    message: string
  ) => {
    if (!user) return;
    try {
      await updateItemSuggestionStatus(user.uid, suggestion.id, status, message || undefined);
      await loadItemSuggestions();
      toast.success(status === 'approved' ? '요청을 승인했습니다.' : '요청을 거절했습니다.');
      setSelectedItemSuggestion(null);
      setSuggestionResponseMessage('');
    } catch (error) {
      console.error('Failed to update suggestion:', error);
      toast.error('처리에 실패했습니다.');
    }
  };

  // 물품 요청 삭제
  const handleDeleteSuggestion = async (suggestionId: string) => {
    if (!user) return;
    try {
      await deleteItemSuggestion(user.uid, suggestionId);
      await loadItemSuggestions();
      toast.success('요청을 삭제했습니다.');
    } catch (error) {
      console.error('Failed to delete suggestion:', error);
      toast.error('삭제에 실패했습니다.');
    }
  };

  // 쿠키 상점 아이템 추가 (전체 클래스 공유)
  const handleAddCookieShopItem = async () => {
    if (!user) return;
    if (!newCookieItemName || !newCookieItemPrice) {
      toast.error('상품명과 가격을 입력해주세요.');
      return;
    }
    try {
      await addCookieShopItem(user.uid, {
        name: newCookieItemName,
        description: newCookieItemDescription,
        price: parseInt(newCookieItemPrice),
        isActive: true
      });
      setNewCookieItemName('');
      setNewCookieItemPrice('');
      setNewCookieItemDescription('');
      await loadCookieShopItems();
      toast.success('실물 상품이 추가되었습니다!');
    } catch (error) {
      toast.error('상품 추가에 실패했습니다.');
    }
  };

  // 쿠키 상점 아이템 삭제 (전체 클래스 공유)
  const handleDeleteCookieShopItem = async (itemId: string) => {
    if (!user) return;
    try {
      await deleteCookieShopItem(user.uid, itemId);
      await loadCookieShopItems();
      toast.success('상품이 삭제되었습니다.');
    } catch (error) {
      toast.error('상품 삭제에 실패했습니다.');
    }
  };

  // 쿠키 상점 아이템 가격 수정 (전체 클래스 공유)
  const handleUpdateCookieShopItemPrice = async (itemId: string, newPrice: number) => {
    if (!user) return;
    try {
      await updateCookieShopItem(user.uid, itemId, { price: newPrice });
      await loadCookieShopItems();
      toast.success('가격이 수정되었습니다!');
    } catch (error) {
      toast.error('가격 수정에 실패했습니다.');
    }
  };

  // 쿠키 상점 신청 응답 (전체 클래스 공유)
  const handleCookieRequestResponse = async (status: 'approved' | 'rejected' | 'completed') => {
    if (!user || !selectedCookieRequest) return;
    try {
      await updateCookieShopRequestStatus(
        user.uid,
        selectedCookieRequest.id,
        status,
        teacherResponse
      );
      await loadCookieShopRequests();
      setShowCookieRequestModal(false);
      setSelectedCookieRequest(null);
      setTeacherResponse('');
      toast.success(status === 'approved' ? '신청이 승인되었습니다.' : status === 'rejected' ? '신청이 거절되었습니다.' : '처리가 완료되었습니다.');
    } catch (error) {
      toast.error('신청 처리에 실패했습니다.');
    }
  };

  // ========== 팀 핸들러 ==========
  const loadTeams = async () => {
    if (!user || !selectedClass) return;
    setIsLoadingTeams(true);
    try {
      const teamsData = await getTeams(user.uid, selectedClass);
      setTeams(teamsData);
    } catch (error) {
      console.error('Failed to load teams:', error);
    }
    setIsLoadingTeams(false);
  };

  // 팀 현황 데이터 로드 (팀원별 잔디 데이터)
  const loadTeamStatus = async () => {
    if (!user || !selectedClass) return;
    setIsLoadingTeamStatus(true);
    try {
      // 먼저 팀 데이터 로드
      const teamsData = await getTeams(user.uid, selectedClass);
      setTeams(teamsData);

      // 모든 팀원의 코드 수집
      const allMemberCodes: string[] = [];
      teamsData.forEach(team => {
        allMemberCodes.push(...team.members);
      });

      // 잔디 데이터 로드
      const grassDataRaw = await getGrassData(user.uid, selectedClass);

      // 학생별로 잔디 데이터 그룹화
      const studentGrassMap = new Map<string, Array<{ date: string; cookieChange: number; count: number }>>();

      allMemberCodes.forEach(code => {
        const studentGrass = grassDataRaw
          .filter(g => g.studentCode === code)
          .map(g => ({ date: g.date, cookieChange: g.cookieChange, count: g.count }))
          .sort((a, b) => a.date.localeCompare(b.date));
        studentGrassMap.set(code, studentGrass);
      });

      setTeamStatusData(studentGrassMap);
    } catch (error) {
      console.error('Failed to load team status:', error);
    }
    setIsLoadingTeamStatus(false);
  };

  const handleCreateTeam = async () => {
    if (!user || !selectedClass) return;
    if (!newTeamName) {
      toast.error('팀 이름을 입력해주세요.');
      return;
    }
    try {
      await createTeam(user.uid, selectedClass, newTeamName, newTeamFlag);
      setNewTeamName('');
      await loadTeams();
      toast.success('팀이 생성되었습니다!');
    } catch (error) {
      toast.error('팀 생성에 실패했습니다.');
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    if (!user || !selectedClass) return;
    try {
      await deleteTeam(user.uid, selectedClass, teamId);
      await loadTeams();
      toast.success('팀이 삭제되었습니다.');
    } catch (error) {
      toast.error('팀 삭제에 실패했습니다.');
    }
  };

  const handleAddMemberToTeam = async (teamId: string, studentCode: string) => {
    if (!user || !selectedClass) return;
    try {
      await addTeamMember(user.uid, selectedClass, teamId, studentCode);
      await loadTeams();
      toast.success('멤버가 추가되었습니다.');
    } catch (error) {
      toast.error('멤버 추가에 실패했습니다.');
    }
  };

  const handleRemoveMemberFromTeam = async (teamId: string, studentCode: string) => {
    if (!user || !selectedClass) return;
    try {
      await removeTeamMember(user.uid, selectedClass, teamId, studentCode);
      await loadTeams();
      toast.success('멤버가 제거되었습니다.');
    } catch (error) {
      toast.error('멤버 제거에 실패했습니다.');
    }
  };

  // 학생 클릭 시 교환 선택
  const handleSelectStudentForSwap = async (studentCode: string, teamId: string) => {
    if (!user || !selectedClass) return;

    if (!swapStudent1) {
      // 첫 번째 학생 선택
      setSwapStudent1({ code: studentCode, teamId });
      toast.info('교환할 두 번째 학생을 선택하세요');
    } else if (swapStudent1.code === studentCode) {
      // 같은 학생 다시 클릭 - 선택 취소
      setSwapStudent1(null);
      toast.info('선택이 취소되었습니다');
    } else {
      // 두 번째 학생 선택 - 교환 실행
      try {
        // 학생1을 팀2로, 학생2를 팀1으로
        await removeTeamMember(user.uid, selectedClass, swapStudent1.teamId, swapStudent1.code);
        await removeTeamMember(user.uid, selectedClass, teamId, studentCode);
        await addTeamMember(user.uid, selectedClass, teamId, swapStudent1.code);
        await addTeamMember(user.uid, selectedClass, swapStudent1.teamId, studentCode);

        await loadTeams();
        toast.success('학생이 교환되었습니다!');
      } catch (error) {
        toast.error('교환에 실패했습니다.');
      }
      setSwapStudent1(null);
    }
  };

  // ========== 배틀 핸들러 ==========
  const loadBattles = async () => {
    if (!user || !selectedClass) return;
    setIsLoadingBattles(true);
    try {
      const battlesData = await getBattles(user.uid, selectedClass);
      setBattles(battlesData);
    } catch (error) {
      console.error('Failed to load battles:', error);
    }
    setIsLoadingBattles(false);
  };

  const handleCreateBattle = async () => {
    if (!user || !selectedClass) return;
    if (!newBattleTitle || !newBattleTeam1 || !newBattleTeam2) {
      toast.error('배틀 제목과 팀을 선택해주세요.');
      return;
    }
    if (newBattleTeam1 === newBattleTeam2) {
      toast.error('서로 다른 팀을 선택해주세요.');
      return;
    }
    try {
      await createBattle(
        user.uid,
        selectedClass,
        newBattleTitle,
        '',
        newBattleTeam1,
        newBattleTeam2,
        parseInt(newBattleReward)
      );
      setNewBattleTitle('');
      setNewBattleTeam1('');
      setNewBattleTeam2('');
      await loadBattles();
      toast.success('배틀이 시작되었습니다!');
    } catch (error) {
      toast.error('배틀 생성에 실패했습니다.');
    }
  };

  const handleUpdateBattleScore = async (battleId: string, team1Score: number, team2Score: number) => {
    if (!user || !selectedClass) return;
    try {
      await updateBattleScore(user.uid, selectedClass, battleId, team1Score, team2Score);
      await loadBattles();
    } catch (error) {
      toast.error('점수 업데이트에 실패했습니다.');
    }
  };

  const handleEndBattle = async (battle: Battle) => {
    if (!user || !selectedClass) return;
    let winnerId: string | null = null;
    if (battle.team1Score > battle.team2Score) winnerId = battle.team1Id;
    else if (battle.team2Score > battle.team1Score) winnerId = battle.team2Id;

    try {
      await endBattle(user.uid, selectedClass, battle.id, winnerId);
      await loadBattles();
      toast.success('배틀이 종료되었습니다!');
    } catch (error) {
      toast.error('배틀 종료에 실패했습니다.');
    }
  };

  const handleDeleteBattle = async (battleId: string) => {
    if (!user || !selectedClass) return;
    try {
      await deleteBattle(user.uid, selectedClass, battleId);
      await loadBattles();
      toast.success('배틀이 삭제되었습니다.');
    } catch (error) {
      toast.error('배틀 삭제에 실패했습니다.');
    }
  };

  // ========== 소원 핸들러 ==========
  const loadWishes = async () => {
    if (!user) return;
    setIsLoadingWishes(true);
    try {
      // 24시간 지난 선정 소원 자동 삭제
      try {
        await cleanupExpiredGrantedWishes(user.uid);
      } catch (e) {
        console.warn('Failed to cleanup expired wishes:', e);
      }

      // 기존 소원에 classId 마이그레이션 (학생 코드 기반) - 실패해도 계속 진행
      try {
        const migrationResult = await migrateWishesClassId(user.uid);
        if (migrationResult.migrated > 0) {
          toast.success(`${migrationResult.migrated}개 소원에 학급 정보가 할당되었습니다.`);
        }
      } catch (e) {
        console.warn('Failed to migrate wishes classId:', e);
      }

      // 소원 목록 조회
      const wishesData = await getWishes(user.uid, '');
      setWishes(wishesData);
      setWishPage(1); // 페이지 리셋
    } catch (error) {
      console.error('Failed to load wishes:', error);
    }
    setIsLoadingWishes(false);
  };

  const handleGrantWish = async (wishId: string, message: string) => {
    if (!user) return;
    try {
      // 소원은 모든 클래스룸에서 공유되므로 classId는 사용되지 않음
      await grantWish(user.uid, '', wishId, message);
      await loadWishes();
      toast.success('소원이 선정되었습니다!');
    } catch (error) {
      toast.error('소원 선정에 실패했습니다.');
    }
  };

  const handleDeleteWish = async (wishId: string) => {
    if (!user) return;
    try {
      // 소원은 모든 클래스룸에서 공유되므로 classId는 사용되지 않음
      await deleteWish(user.uid, '', wishId);
      await loadWishes();
      toast.success('소원이 삭제되었습니다.');
    } catch (error) {
      toast.error('소원 삭제에 실패했습니다.');
    }
  };

  // 팀 플래그 옵션 - game.ts의 TEAM_FLAGS 사용 (동물/자연 이모지)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4">
              <span className="text-2xl">🍪</span>
              <div>
                <h1 className="text-xl font-bold text-gray-800">DaJanDi 선생님</h1>
                <p className="text-sm text-gray-500">{teacher?.schoolName} - {teacher?.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <FeedbackButton onClick={() => setShowFeedbackModal(true)} variant="outline" />
              <Button
                variant="outline"
                onClick={handleSync}
                disabled={isSyncing}
                className="flex items-center gap-1"
              >
                <span className={isSyncing ? 'animate-spin' : ''}>🔄</span>
                <span>{isSyncing ? '동기화 중...' : '전체 동기화'}</span>
              </Button>
              <div className="relative">
                <Button
                  variant="outline"
                  onClick={() => setShowHelpMenu(!showHelpMenu)}
                  className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
                >
                  <span>❓</span>
                  <span>도움말</span>
                  <span className="text-xs">▼</span>
                </Button>
                {showHelpMenu && (
                  <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border z-50">
                    <button
                      onClick={() => {
                        setActiveTab('classes'); // Reset to first tab
                        startTutorial(0);
                        setShowHelpMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-blue-50 rounded-t-lg flex items-center gap-2"
                    >
                      <span>📚</span>
                      <span>전체 도움말</span>
                    </button>
                    <button
                      onClick={() => {
                        const tabStepIndex = getFirstStepIndexForTab(activeTab);
                        if (tabStepIndex >= 0) {
                          // Navigate to the tab first (in case we're not there)
                          const targetStep = teacherTutorialSteps[tabStepIndex] as TutorialStep;
                          if (targetStep?.data?.tab) {
                            setActiveTab(targetStep.data.tab);
                          }
                          startTutorial(tabStepIndex);
                        } else {
                          setActiveTab('classes');
                          startTutorial(0);
                        }
                        setShowHelpMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-blue-50 rounded-b-lg flex items-center gap-2 border-t"
                    >
                      <span>📍</span>
                      <span>현재 탭 도움말</span>
                    </button>
                  </div>
                )}
              </div>
              <Button variant="outline" onClick={onLogout} className="flex items-center gap-1">
                <span>🚪</span>
                <span>로그아웃</span>
              </Button>
            </div>
          </div>
          {/* 학급 선택 - 헤더에 크게 표시 (숨긴 학급 제외) */}
          {classes.filter(c => !hiddenClasses.includes(c.id)).length > 0 && (
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
              <span className="text-lg font-medium text-blue-700">📚 학급:</span>
              <select
                value={selectedClass || ''}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => selectClass(e.target.value || null)}
                className="class-selector flex-1 px-4 py-2 text-lg font-bold border-2 border-blue-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- 학급을 선택하세요 --</option>
                {classes.filter(c => !hiddenClasses.includes(c.id)).map((cls: ClassInfo) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} ({cls.studentCount || 0}명)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="w-full flex justify-evenly gap-2">
            <TabsTrigger value="classes" data-tab="classes">📚 학급</TabsTrigger>
            <TabsTrigger value="students" data-tab="students">👨‍🎓 학생</TabsTrigger>
            <TabsTrigger value="grass" data-tab="grass" onClick={loadGrassData}>🌱 잔디</TabsTrigger>
            <TabsTrigger value="shop" data-tab="shop" onClick={loadShopItems}>🏪 상점</TabsTrigger>
            <TabsTrigger value="teams" data-tab="teams" onClick={() => { loadTeams(); if (teamTabMode === 'status') loadTeamStatus(); }}>👥 팀</TabsTrigger>
            <TabsTrigger value="gameCenter" data-tab="gameCenter">🎮 게임센터</TabsTrigger>
            <TabsTrigger value="wishes" data-tab="wishes" onClick={loadWishes}>⭐ 소원</TabsTrigger>
            <TabsTrigger value="features" data-tab="features">🔧 기능</TabsTrigger>
            <TabsTrigger value="profiles" data-tab="profiles">👤 프로필</TabsTrigger>
            <TabsTrigger value="settings" data-tab="settings">⚙️ 설정</TabsTrigger>
          </TabsList>

          {/* 학급 관리 탭 */}
          <TabsContent value="classes" className="space-y-6">
            {/* 학급 가져오기 */}
            <Card>
              <CardHeader>
                <CardTitle>📥 다했니에서 학급 가져오기</CardTitle>
                <CardDescription>
                  다했니 API를 통해 등록된 학급을 자동으로 가져옵니다.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={handleImportClassrooms}
                  disabled={isImporting}
                  className="bg-blue-500 hover:bg-blue-600"
                  data-tutorial="import-classes"
                >
                  {isImporting ? '가져오는 중...' : '🔄 학급 가져오기'}
                </Button>
              </CardContent>
            </Card>

            {/* 학급 목록 */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>📋 학급 목록</CardTitle>
                    <CardDescription>
                      {classes.filter(c => !hiddenClasses.includes(c.id)).length}개의 학급
                      {hiddenClasses.length > 0 && ` (${hiddenClasses.length}개 숨김)`}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {!viewHiddenMode && !groupMode && (
                      <Button
                        variant={hideMode ? "default" : "outline"}
                        size="sm"
                        data-tutorial="hide-classes"
                        onClick={() => {
                          if (hideMode && selectedForHide.length > 0) {
                            handleApplyHide();
                          } else {
                            setHideMode(!hideMode);
                            setSelectedForHide([]);
                          }
                        }}
                      >
                        {hideMode ? (selectedForHide.length > 0 ? `🙈 ${selectedForHide.length}개 숨기기` : '✕ 취소') : '🙈 가리기'}
                      </Button>
                    )}
                    {hiddenClasses.length > 0 && !hideMode && !groupMode && (
                      <Button
                        variant={viewHiddenMode ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          if (viewHiddenMode && selectedForHide.length > 0) {
                            handleApplyUnhide();
                          } else {
                            setViewHiddenMode(!viewHiddenMode);
                            setSelectedForHide([]);
                          }
                        }}
                      >
                        {viewHiddenMode ? (selectedForHide.length > 0 ? `👁️ ${selectedForHide.length}개 보이기` : '✕ 취소') : '👁️ 숨긴 학급'}
                      </Button>
                    )}
                    {!hideMode && !viewHiddenMode && (
                      <Button
                        variant={groupMode ? "default" : "outline"}
                        size="sm"
                        data-tutorial="group-classes"
                        onClick={() => {
                          if (groupMode && selectedForGroup.length >= 2) {
                            setShowGroupModal(true);
                          } else {
                            setGroupMode(!groupMode);
                            setSelectedForGroup([]);
                          }
                        }}
                      >
                        {groupMode ? (selectedForGroup.length >= 2 ? `🔗 ${selectedForGroup.length}개 묶기` : '✕ 취소') : '🔗 묶기'}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {viewHiddenMode ? (
                  // 숨긴 학급 보기 모드
                  <div className="space-y-3">
                    <p className="text-sm text-gray-500 mb-3">체크박스를 선택하고 버튼을 눌러 숨김 해제하세요.</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {classes.filter(c => hiddenClasses.includes(c.id)).map((cls) => (
                        <label
                          key={cls.id}
                          className={`p-4 rounded-lg border-2 text-left transition-all cursor-pointer ${
                            selectedForHide.includes(cls.id)
                              ? 'border-green-500 bg-green-50'
                              : 'border-gray-300 bg-gray-100'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={selectedForHide.includes(cls.id)}
                              onChange={() => handleToggleHideClass(cls.id)}
                              className="mt-1"
                            />
                            <div>
                              <div className="font-bold text-gray-600">{cls.name}</div>
                              <div className="text-sm text-gray-400">
                                {cls.studentCount || 0}명
                              </div>
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : classes.filter(c => !hiddenClasses.includes(c.id)).length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    {classes.length === 0
                      ? '등록된 학급이 없습니다. 위 버튼으로 학급을 가져오세요.'
                      : '모든 학급이 숨겨져 있습니다. "숨긴 학급" 버튼을 눌러 확인하세요.'}
                  </p>
                ) : (
                  <>
                    {/* 기존 그룹 목록 */}
                    {classGroups.length > 0 && !hideMode && !groupMode && (
                      <div className="mb-4">
                        <p className="text-sm text-gray-500 mb-2">🔗 소원 공유 그룹</p>
                        <div className="flex flex-wrap gap-2">
                          {classGroups.map(group => (
                            <div
                              key={group.id}
                              className="flex items-center gap-2 px-3 py-1 bg-purple-100 rounded-full text-sm"
                            >
                              <span className="font-medium text-purple-700">{group.name}</span>
                              <span className="text-purple-500">
                                ({group.classIds.map(id => classes.find(c => c.id === id)?.name || id).join(', ')})
                              </span>
                              <button
                                onClick={() => handleDeleteGroup(group.id, group.name)}
                                className="text-purple-400 hover:text-purple-600"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {groupMode && (
                      <p className="text-sm text-purple-600 mb-3">
                        🔗 묶을 학급을 2개 이상 선택하세요. (소원의 돌에서 소원을 공유합니다)
                      </p>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {classes.filter(c => !hiddenClasses.includes(c.id)).map((cls) => {
                        const classGroup = getGroupForClass(cls.id);
                        return hideMode ? (
                          <label
                            key={cls.id}
                            className={`p-4 rounded-lg border-2 text-left transition-all cursor-pointer ${
                              selectedForHide.includes(cls.id)
                                ? 'border-orange-500 bg-orange-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                checked={selectedForHide.includes(cls.id)}
                                onChange={() => handleToggleHideClass(cls.id)}
                                className="mt-1"
                              />
                              <div>
                                <div className="font-bold">{cls.name}</div>
                                <div className="text-sm text-gray-500">
                                  {cls.studentCount || 0}명
                                </div>
                              </div>
                            </div>
                          </label>
                        ) : groupMode ? (
                          <label
                            key={cls.id}
                            className={`p-4 rounded-lg border-2 text-left transition-all cursor-pointer ${
                              selectedForGroup.includes(cls.id)
                                ? 'border-purple-500 bg-purple-50'
                                : classGroup
                                  ? 'border-purple-200 bg-purple-50/50 opacity-60 cursor-not-allowed'
                                  : 'border-gray-200 hover:border-purple-300'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                checked={selectedForGroup.includes(cls.id)}
                                onChange={() => !classGroup && handleToggleGroupClass(cls.id)}
                                disabled={!!classGroup}
                                className="mt-1"
                              />
                              <div>
                                <div className="font-bold">{cls.name}</div>
                                <div className="text-sm text-gray-500">
                                  {cls.studentCount || 0}명
                                </div>
                                {classGroup && (
                                  <div className="text-xs text-purple-500 mt-1">
                                    🔗 {classGroup.name}
                                  </div>
                                )}
                              </div>
                            </div>
                          </label>
                        ) : (
                          <button
                            key={cls.id}
                            onClick={() => selectClass(cls.id)}
                            className={`p-4 rounded-lg border-2 text-left transition-all ${
                              selectedClass === cls.id
                                ? 'border-blue-500 bg-blue-50'
                                : classGroup
                                  ? 'border-purple-200 hover:border-purple-300'
                                  : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="font-bold">{cls.name}</div>
                            <div className="text-sm text-gray-500">
                              {cls.studentCount || 0}명
                            </div>
                            {classGroup && (
                              <div className="text-xs text-purple-500 mt-1">
                                🔗 {classGroup.name}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

          </TabsContent>

          {/* 학생 관리 탭 */}
          <TabsContent value="students" className="space-y-6">
            {!selectedClass ? (
              <Card>
                <CardContent className="py-8 text-center text-gray-500">
                  👆 상단에서 학급을 선택해주세요.
                </CardContent>
              </Card>
            ) : (
              <>
                {/* 쿠키 새로고침 & 전체 지급 */}
                <Card>
                  <CardHeader>
                    <CardTitle>🍪 쿠키 관리</CardTitle>
                    <CardDescription>
                      쿠키 새로고침 및 학생들에게 쿠키 지급
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-2">
                      <Button
                        onClick={handleRefreshCookies}
                        disabled={isRefreshing}
                        className="bg-amber-500 hover:bg-amber-600"
                        data-tutorial="refresh-cookies"
                      >
                        {isRefreshing ? '새로고침 중...' : '🔄 쿠키 새로고침'}
                      </Button>
                      <Button
                        onClick={() => {
                          setShowBulkCookieMode(!showBulkCookieMode);
                          setSelectedForCookie([]);
                          setBulkCookieAmount('');
                        }}
                        className={showBulkCookieMode ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}
                        data-tutorial="bulk-candy"
                      >
                        {showBulkCookieMode ? '✕ 취소' : '🎁 전체 지급'}
                      </Button>
                    </div>

                    {/* 전체 지급 모드 */}
                    {showBulkCookieMode && (
                      <div className="p-4 bg-green-50 rounded-lg border border-green-200 space-y-3">
                        <p className="text-sm text-green-700 font-medium">
                          📋 아래 학생 목록에서 체크박스로 학생을 선택한 후 쿠키 수를 입력하세요.
                        </p>
                        <div className="flex gap-2 items-center">
                          <Input
                            type="number"
                            placeholder="쿠키 수 (음수도 가능)"
                            value={bulkCookieAmount}
                            onChange={(e) => setBulkCookieAmount(e.target.value)}
                            className="w-40"
                          />
                          <Button
                            onClick={handleBulkAddCookie}
                            disabled={isAddingBulkCookie || selectedForCookie.length === 0}
                            className="bg-green-500 hover:bg-green-600"
                          >
                            {isAddingBulkCookie ? '처리 중...' : `${selectedForCookie.length}명에게 지급`}
                          </Button>
                        </div>
                        <p className="text-xs text-green-600">
                          선택된 학생: {selectedForCookie.length}명
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 학생 목록 */}
                <Card data-tutorial="student-list">
                  <CardHeader>
                    <CardTitle>
                      👨‍🎓 학생 목록 - {classes.find(c => c.id === selectedClass)?.name}
                    </CardTitle>
                    <CardDescription>
                      {displayStudents.length}명의 학생 · 클릭하여 상세 정보 보기
                      {runTutorial && students.length === 0 && <span className="ml-2 text-amber-500">(튜토리얼 예시)</span>}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoadingStudents ? (
                      <p className="text-center py-8 text-gray-500">로딩 중...</p>
                    ) : displayStudents.length === 0 ? (
                      <p className="text-center py-8 text-gray-500">
                        등록된 학생이 없습니다.
                      </p>
                    ) : (
                      <div className="overflow-x-auto bg-white rounded-lg p-2">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-gray-50">
                              {showBulkCookieMode && (
                                <th className="text-center py-2 px-2 w-10">
                                  <Checkbox
                                    checked={selectedForCookie.length === displayStudents.length && displayStudents.length > 0}
                                    onCheckedChange={(checked) => handleSelectAllForCookie(!!checked)}
                                  />
                                </th>
                              )}
                              <th className="text-left py-2 px-2">번호</th>
                              <th className="text-left py-2 px-2">이름</th>
                              <th className="text-center py-2 px-2">뱃지</th>
                              <th className="text-right py-2 px-2">🍪 쿠키</th>
                              <th className="text-right py-2 px-2">🍭 캔디</th>
                            </tr>
                          </thead>
                          <tbody>
                            {displayStudents.map((student) => (
                              <tr
                                key={student.code}
                                className={`border-b hover:bg-amber-50 cursor-pointer transition-colors ${
                                  showBulkCookieMode && selectedForCookie.includes(student.code) ? 'bg-green-50' : ''
                                }`}
                                onClick={() => {
                                  if (showBulkCookieMode) {
                                    handleSelectStudentForCookie(student.code, !selectedForCookie.includes(student.code));
                                  } else {
                                    handleStudentDoubleClick(student);
                                  }
                                }}
                              >
                                {showBulkCookieMode && (
                                  <td className="py-2 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                                    <Checkbox
                                      checked={selectedForCookie.includes(student.code)}
                                      onCheckedChange={(checked) => handleSelectStudentForCookie(student.code, !!checked)}
                                    />
                                  </td>
                                )}
                                <td className="py-2 px-2">{student.number}</td>
                                <td className="py-2 px-2">
                                  <div className="flex items-center gap-2">
                                    {student.profilePhotoUrl && student.profile.profilePhotoActive ? (
                                      <img
                                        src={student.profilePhotoUrl}
                                        alt={student.name}
                                        className="w-8 h-8 rounded-full object-cover border-2 border-gray-200"
                                      />
                                    ) : (
                                      <span className="text-lg">
                                        {(() => {
                                          const item = ALL_SHOP_ITEMS.find(i => i.code === student.profile.emojiCode);
                                          return item?.value || '😊';
                                        })()}
                                      </span>
                                    )}
                                    <span className="font-medium">{student.name}</span>
                                  </div>
                                </td>
                                <td className="py-2 px-2">
                                  <div className="flex justify-center gap-1">
                                    {student.badges && (Object.entries(student.badges) as [string, Badge][])
                                      .filter(([, badge]) => badge.hasBadge)
                                      .slice(0, 5)
                                      .map(([key, badge]) => (
                                        <img
                                          key={key}
                                          src={badge.imgUrl}
                                          alt={badge.title}
                                          title={badge.title}
                                          className="w-5 h-5 rounded"
                                        />
                                      ))}
                                    {(!student.badges || (Object.values(student.badges) as Badge[]).filter(b => b.hasBadge).length === 0) && (
                                      <span className="text-gray-300 text-xs">-</span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2 px-2 text-right text-amber-600">
                                  {student.cookie}
                                </td>
                                <td className="py-2 px-2 text-right font-bold text-pink-600">
                                  {student.jelly ?? student.cookie}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 학생 추가 */}
                <Card>
                  <CardHeader>
                    <CardTitle>➕ 학생 추가</CardTitle>
                    <CardDescription>
                      다했니에서 다운로드한 학생코드 파일로 일괄 추가할 수 있습니다.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* XLSX 일괄 추가 */}
                    <div data-tutorial="student-code-upload">
                      <h4 className="text-sm font-medium mb-2">📁 학생코드 파일 업로드</h4>
                      <p className="text-sm text-gray-500 mb-3">
                        다했니 &gt; 학생 관리 &gt; 학생코드 다운로드를 한 파일을 올려주세요!
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <label className="cursor-pointer">
                          <Button
                            variant="default"
                            className="bg-green-500 hover:bg-green-600"
                            disabled={isUploadingCsv}
                            asChild
                          >
                            <span>
                              {isUploadingCsv ? '업로드 중...' : '📤 XLSX 업로드'}
                            </span>
                          </Button>
                          <input
                            type="file"
                            accept=".xlsx,.xls"
                            className="hidden"
                            onChange={handleXlsxUpload}
                            disabled={isUploadingCsv}
                          />
                        </label>
                        <Button
                          variant="outline"
                          onClick={handleExportStudents}
                          disabled={students.length === 0}
                        >
                          📊 학생 목록 내보내기
                        </Button>
                      </div>
                    </div>

                    {/* 학생 초기화 */}
                    <div className="border-t pt-4">
                      <h4 className="text-sm font-medium mb-2 text-red-600">🗑️ 학생 초기화</h4>
                      <p className="text-sm text-gray-500 mb-3">
                        현재 학급의 모든 학생 데이터를 삭제합니다. 이 작업은 되돌릴 수 없습니다.
                      </p>
                      {!showResetConfirm ? (
                        <Button
                          variant="outline"
                          className="border-red-300 text-red-600 hover:bg-red-50"
                          onClick={() => setShowResetConfirm(true)}
                          disabled={students.length === 0}
                        >
                          🗑️ 학생 전체 삭제
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
                          <span className="text-sm text-red-700">
                            정말 {students.length}명의 학생을 삭제하시겠습니까?
                          </span>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleResetStudents}
                            disabled={isResettingStudents}
                          >
                            {isResettingStudents ? '삭제 중...' : '삭제 확인'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowResetConfirm(false)}
                            disabled={isResettingStudents}
                          >
                            취소
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* 잔디 탭 */}
          <TabsContent value="grass" className="space-y-6">
            {!selectedClass ? (
              <Card>
                <CardContent className="py-12 text-center text-gray-500">
                  👆 먼저 학급 관리 탭에서 학급을 선택해주세요.
                </CardContent>
              </Card>
            ) : (
              <>
                {/* 잔디 새로고침 */}
                <Card data-tutorial="grass-overview">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>🌱 학급 잔디 현황</CardTitle>
                      <Button
                        onClick={loadGrassFieldData}
                        disabled={isLoadingGrassField}
                        variant="outline"
                        className="bg-green-50 hover:bg-green-100 text-green-700 border-green-300"
                      >
                        {isLoadingGrassField ? '로딩 중...' : '🌿 잔디밭'}
                      </Button>
                    </div>
                    <CardDescription>
                      {classes.find((c: ClassInfo) => c.id === selectedClass)?.name} - 평일 기준 쿠키 변화량
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      {/* 네비게이션 버튼 */}
                      <div className="flex items-center gap-1 mr-2" data-tutorial="grass-navigation">
                        <Button
                          onClick={() => setGrassOffset(grassOffset + 10)}
                          variant="outline"
                          size="sm"
                          className="px-2"
                          title="이전 10일"
                        >
                          ◀
                        </Button>
                        <span className="text-sm text-gray-600 min-w-[80px] text-center">
                          {grassOffset === 0 ? '최근 10일' : `${grassOffset}일 전`}
                        </span>
                        <Button
                          onClick={() => setGrassOffset(Math.max(0, grassOffset - 10))}
                          variant="outline"
                          size="sm"
                          className="px-2"
                          disabled={grassOffset === 0}
                          title="다음 10일"
                        >
                          ▶
                        </Button>
                      </div>
                      <Button
                        onClick={loadGrassData}
                        disabled={isLoadingGrass}
                        variant="outline"
                      >
                        {isLoadingGrass ? '로딩 중...' : '🔄 새로고침'}
                      </Button>
                      <Button
                        onClick={handleResetGrass}
                        disabled={isResettingGrass || isLoadingGrass}
                        variant="outline"
                        className="text-red-600 hover:bg-red-50"
                      >
                        {isResettingGrass ? '초기화 중...' : '🗑️ 초기화'}
                      </Button>
                      <label className="relative cursor-pointer">
                        <input
                          type="file"
                          accept=".xlsx"
                          multiple
                          onChange={(e) => handlePastGrassUpload(e.target.files)}
                          className="hidden"
                          disabled={isUploadingPastGrass}
                        />
                        <Button
                          variant="outline"
                          className="text-green-600 hover:bg-green-50"
                          disabled={isUploadingPastGrass}
                          asChild
                        >
                          <span>
                            {isUploadingPastGrass ? '업로드 중...' : '📂 과거 잔디 추가'}
                          </span>
                        </Button>
                      </label>
                    </div>

                    {isLoadingGrass ? (
                      <p className="text-center py-8 text-gray-500">로딩 중...</p>
                    ) : displayStudents.length === 0 ? (
                      <p className="text-center py-8 text-gray-500">
                        등록된 학생이 없습니다.
                      </p>
                    ) : (
                      <div className="overflow-x-auto bg-white rounded-lg p-2">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-gray-50">
                              <th className="text-left py-2 px-2 sticky left-0 bg-gray-50">학생</th>
                              {getLast14Days().map(date => (
                                <th key={date} className="text-center py-2 px-1 text-xs">
                                  {date.slice(5)}
                                </th>
                              ))}
                              <th className="text-right py-2 px-2">합계</th>
                            </tr>
                          </thead>
                          <tbody>
                            {displayStudents.map((student: Student) => {
                              const grassByDate = getGrassByDate();
                              let totalChange = 0;
                              return (
                                <tr key={student.code} className="border-b hover:bg-gray-50">
                                  <td className="py-2 px-2 font-medium sticky left-0 bg-white">
                                    {student.number}. {student.name}
                                  </td>
                                  {getLast14Days().map(date => {
                                    const data = grassByDate[date]?.[student.code] || { change: 0, count: 0 };
                                    totalChange += data.change;
                                    return (
                                      <td key={date} className="text-center py-2 px-1">
                                        <div
                                          className={`w-6 h-6 mx-auto rounded ${getGrassColor(data.change)}`}
                                          title={`${date}: +${data.change} (${data.count}회)`}
                                        >
                                          {data.change > 0 && (
                                            <span className="text-xs text-white font-bold leading-6">
                                              {data.change}
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                    );
                                  })}
                                  <td className="text-right py-2 px-2 font-bold text-green-600">
                                    +{totalChange}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            {(() => {
                              const grassByDate = getGrassByDate();
                              let grandTotal = 0;
                              const dateTotals = getLast14Days().map(date => {
                                let dateSum = 0;
                                students.forEach((student: Student) => {
                                  const data = grassByDate[date]?.[student.code] || { change: 0 };
                                  dateSum += data.change;
                                });
                                grandTotal += dateSum;
                                return { date, total: dateSum };
                              });
                              return (
                                <tr className="border-t-2 border-green-600 bg-green-50 font-bold">
                                  <td className="py-2 px-2 sticky left-0 bg-green-50 text-green-700">총합</td>
                                  {dateTotals.map(({ date, total }) => (
                                    <td key={date} className="text-center py-2 px-1 text-green-700">
                                      {total > 0 ? total : '-'}
                                    </td>
                                  ))}
                                  <td className="text-right py-2 px-2 text-green-700 text-lg">
                                    +{grandTotal}
                                  </td>
                                </tr>
                              );
                            })()}
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 범례 */}
                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span className="text-sm text-gray-500">강도:</span>
                      <div className="flex items-center gap-1">
                        <div className="w-4 h-4 rounded bg-gray-200"></div>
                        <span className="text-xs">없음</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-4 h-4 rounded bg-green-300"></div>
                        <span className="text-xs">1개</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-4 h-4 rounded bg-green-500"></div>
                        <span className="text-xs">2개</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-4 h-4 rounded bg-green-700"></div>
                        <span className="text-xs">3개+</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* 상점 탭 */}
          <TabsContent value="shop" className="space-y-6">
            {/* 상점 모드 토글 */}
            <div className="flex gap-2 p-1 bg-gray-100 rounded-lg w-fit" data-tutorial="shop-mode-toggle">
              <button
                onClick={() => setShopMode('candy')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  shopMode === 'candy'
                    ? 'bg-white text-pink-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                data-tutorial="candy-shop-tab"
              >
                🍭 캔디 상점 (프로필)
              </button>
              <button
                onClick={() => {
                  setShopMode('cookie');
                  if (selectedClass) {
                    loadCookieShopItems();
                    loadCookieShopRequests();
                    loadItemSuggestions();
                  }
                }}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                  shopMode === 'cookie'
                    ? 'bg-white text-amber-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                data-tutorial="cookie-shop-tab"
              >
                🍪 쿠키 상점 (실물 교환)
                {pendingRequestsCount > 0 && (
                  <span className="px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                    {pendingRequestsCount}
                  </span>
                )}
              </button>
            </div>

            {/* 캔디 상점 (프로필) */}
            {shopMode === 'candy' && (
              <Card>
                <CardHeader>
                  <CardTitle>🍭 캔디 상점 관리</CardTitle>
                  <CardDescription>학생들이 캔디로 구매할 수 있는 프로필 아이템을 등록하세요</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 아이템 추가 */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                      <Input
                        placeholder="상품명 (예: 😎 쿨한)"
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                      />
                      <Input
                        type="number"
                        placeholder="가격"
                        value={newItemPrice}
                        onChange={(e) => setNewItemPrice(e.target.value)}
                      />
                      <select
                        value={newItemCategory}
                        onChange={(e) => setNewItemCategory(e.target.value)}
                        className="px-3 py-2 border rounded-md text-sm"
                      >
                        <option value="emoji">이모지</option>
                        <option value="nameEffect">이름효과</option>
                        <option value="titleColor">칭호색상</option>
                        <option value="animation">애니메이션</option>
                        <option value="custom">커스텀</option>
                      </select>
                      <Input
                        placeholder="값 (예: 😎)"
                        value={newItemDescription}
                        onChange={(e) => setNewItemDescription(e.target.value)}
                      />
                      <Button onClick={handleAddShopItem} className="bg-green-500 hover:bg-green-600 col-span-2 md:col-span-2">
                        + 추가
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">카테고리별 값: 이모지(😎), 이름효과(gradient-fire), 칭호색상(0~9), 애니메이션(pulse)</p>

                  {/* 기본 상품 일괄 등록 */}
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-amber-800">📦 기본 상품 일괄 등록</p>
                        <p className="text-xs text-amber-600">이모지, 이름효과, 칭호색상, 애니메이션 등을 한 번에 등록합니다</p>
                      </div>
                      <Button
                        onClick={handleRegisterDefaultItems}
                        disabled={isRegisteringDefaults}
                        className="bg-amber-500 hover:bg-amber-600"
                        data-tutorial="register-default-items"
                      >
                        {isRegisteringDefaults ? '등록 중...' : '🛒 기본 상품 등록'}
                      </Button>
                    </div>
                  </div>

                  {/* 상점 전체 삭제 */}
                  {shopItems.length > 0 && (
                    <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-red-800">🗑️ 상점 전체 삭제</p>
                          <p className="text-xs text-red-600">현재 등록된 모든 상품({shopItems.length}개)을 삭제합니다</p>
                        </div>
                        {!showDeleteAllShopConfirm ? (
                          <Button
                            variant="outline"
                            onClick={() => setShowDeleteAllShopConfirm(true)}
                            className="border-red-300 text-red-600 hover:bg-red-50"
                          >
                            🗑️ 전체 삭제
                          </Button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-red-700">정말 삭제하시겠습니까?</span>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={handleDeleteAllShopItems}
                              disabled={isDeletingAllShop}
                            >
                              {isDeletingAllShop ? '삭제 중...' : '확인'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowDeleteAllShopConfirm(false)}
                              disabled={isDeletingAllShop}
                            >
                              취소
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 카테고리 탭 */}
                  <div className="flex flex-wrap gap-2 py-3 border-b mb-4">
                    {[
                      { key: 'all', label: '전체', icon: '📦' },
                      { key: 'emoji', label: '이모지', icon: '😊' },
                      { key: 'custom', label: '커스텀', icon: '⚙️' },
                      { key: 'titleColor', label: '칭호색상', icon: '🎨' },
                      { key: 'nameEffect', label: '이름효과', icon: '✨' },
                      { key: 'animation', label: '애니메이션', icon: '🎬' },
                      { key: 'buttonBorder', label: '버튼테두리', icon: '🔲' },
                      { key: 'buttonFill', label: '버튼채우기', icon: '🎨' },
                    ].map((cat) => {
                      const count = cat.key === 'all'
                        ? shopItems.length
                        : shopItems.filter(item => item.category === cat.key).length;
                      return (
                        <button
                          key={cat.key}
                          onClick={() => setShopCategoryFilter(cat.key)}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1 ${
                            shopCategoryFilter === cat.key
                              ? 'bg-amber-500 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          <span>{cat.icon}</span>
                          <span>{cat.label}</span>
                          <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${
                            shopCategoryFilter === cat.key ? 'bg-amber-600' : 'bg-gray-200'
                          }`}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* 아이템 목록 */}
                  {isLoadingShop ? (
                    <p className="text-center py-8 text-gray-500">로딩 중...</p>
                  ) : shopItems.length === 0 ? (
                    <p className="text-center py-8 text-gray-500">등록된 상품이 없습니다.</p>
                  ) : shopItems.filter(item => shopCategoryFilter === 'all' || item.category === shopCategoryFilter).length === 0 ? (
                    <p className="text-center py-8 text-gray-500">해당 카테고리에 상품이 없습니다.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {shopItems
                        .filter(item => shopCategoryFilter === 'all' || item.category === shopCategoryFilter)
                        .map((item) => (
                        <div key={item.code} className="p-3 border rounded-lg">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className="font-medium">{item.name}</p>
                              <p className="text-xs text-gray-400">{item.category}</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 h-6 px-2"
                              onClick={() => handleDeleteShopItem(item.code)}
                            >
                              삭제
                            </Button>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              defaultValue={item.price}
                              className="w-20 h-8 text-sm"
                              onBlur={(e) => {
                                const newPrice = parseInt(e.target.value);
                                if (!isNaN(newPrice) && newPrice !== item.price) {
                                  handleUpdateItemPrice(item.code, newPrice);
                                }
                              }}
                            />
                            <span className="text-sm">🍭</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* 쿠키 상점 (실물 교환) */}
            {shopMode === 'cookie' && (
              <>
                {!selectedClass ? (
                  <Card>
                    <CardContent className="py-12 text-center text-gray-500">
                      👆 상단에서 학급을 선택해주세요
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {/* 안내 문구 */}
                    <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                      <p className="text-sm text-amber-800 font-medium">🍪 쿠키 상점 안내</p>
                      <p className="text-xs text-amber-600 mt-1">학생들이 실물 상품을 신청하면 다했니 쿠키가 차감됩니다. 매주 목요일 오전 8시에 신청 내역이 이메일로 발송됩니다.</p>
                    </div>

                    {/* 상품 관리 */}
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                          <CardTitle>📦 실물 상품 관리</CardTitle>
                          <CardDescription>학생들이 쿠키로 교환할 수 있는 실물 상품을 등록하세요</CardDescription>
                        </div>
                        <button
                          onClick={() => {
                            loadItemSuggestions();
                            setShowItemSuggestionsModal(true);
                          }}
                          className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-200 transition-all flex items-center gap-1"
                        >
                          💡 물품 요청
                          {itemSuggestions.filter(s => s.status === 'pending').length > 0 && (
                            <span className="px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">
                              {itemSuggestions.filter(s => s.status === 'pending').length}
                            </span>
                          )}
                        </button>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* 상품 추가 */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                          <Input
                            placeholder="상품명 (예: 연필 세트)"
                            value={newCookieItemName}
                            onChange={(e) => setNewCookieItemName(e.target.value)}
                          />
                          <Input
                            type="number"
                            placeholder="가격 (쿠키)"
                            value={newCookieItemPrice}
                            onChange={(e) => setNewCookieItemPrice(e.target.value)}
                          />
                          <Input
                            placeholder="설명 (선택)"
                            value={newCookieItemDescription}
                            onChange={(e) => setNewCookieItemDescription(e.target.value)}
                          />
                          <Button onClick={handleAddCookieShopItem} className="bg-amber-500 hover:bg-amber-600">
                            + 상품 추가
                          </Button>
                        </div>

                        {/* 상품 목록 */}
                        {isLoadingCookieShop ? (
                          <p className="text-center py-8 text-gray-500">로딩 중...</p>
                        ) : cookieShopItems.length === 0 ? (
                          <p className="text-center py-8 text-gray-500">등록된 상품이 없습니다.</p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {cookieShopItems.map((item) => (
                              <div key={item.id} className="p-3 border rounded-lg">
                                <div className="flex justify-between items-start mb-2">
                                  <div>
                                    <p className="font-medium">{item.name}</p>
                                    {item.description && (
                                      <p className="text-xs text-gray-400">{item.description}</p>
                                    )}
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-500 h-6 px-2"
                                    onClick={() => handleDeleteCookieShopItem(item.id)}
                                  >
                                    삭제
                                  </Button>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    defaultValue={item.price}
                                    className="w-20 h-8 text-sm"
                                    onBlur={(e) => {
                                      const newPrice = parseInt(e.target.value);
                                      if (!isNaN(newPrice) && newPrice !== item.price) {
                                        handleUpdateCookieShopItemPrice(item.id, newPrice);
                                      }
                                    }}
                                  />
                                  <span className="text-sm">🍪 쿠키</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* 신청 관리 */}
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            📋 신청 관리
                            {cookieShopRequests.filter(r => r.status === 'pending').length > 0 && (
                              <span className="px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                                {cookieShopRequests.filter(r => r.status === 'pending').length}
                              </span>
                            )}
                          </CardTitle>
                          <CardDescription>학생들의 상품 신청 내역을 관리하세요</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={loadCookieShopRequests}>
                          🔄 새로고침
                        </Button>
                      </CardHeader>
                      <CardContent>
                        {cookieShopRequests.length === 0 ? (
                          <p className="text-center py-8 text-gray-500">신청 내역이 없습니다.</p>
                        ) : (
                          <div className="space-y-3">
                            {cookieShopRequests.map((request) => (
                              <div
                                key={request.id}
                                className={`p-4 border rounded-lg ${
                                  request.status === 'pending' ? 'border-amber-300 bg-amber-50' :
                                  request.status === 'approved' ? 'border-green-300 bg-green-50' :
                                  request.status === 'rejected' ? 'border-red-300 bg-red-50' :
                                  'border-gray-300 bg-gray-50'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="font-medium">{request.studentName} ({request.studentNumber}번)</p>
                                    <p className="text-sm text-gray-600">{request.itemName} x{request.quantity}</p>
                                    <p className="text-xs text-gray-400">총 {request.totalPrice} 쿠키</p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                                      request.status === 'pending' ? 'bg-amber-200 text-amber-800' :
                                      request.status === 'approved' ? 'bg-green-200 text-green-800' :
                                      request.status === 'rejected' ? 'bg-red-200 text-red-800' :
                                      'bg-gray-200 text-gray-800'
                                    }`}>
                                      {request.status === 'pending' ? '대기중' :
                                       request.status === 'approved' ? '승인됨' :
                                       request.status === 'rejected' ? '거절됨' : '완료'}
                                    </span>
                                    {request.status === 'pending' && (
                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          setSelectedCookieRequest(request);
                                          setShowCookieRequestModal(true);
                                        }}
                                      >
                                        처리
                                      </Button>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={async () => {
                                        if (!user) return;
                                        if (confirm(`${request.studentName}님의 "${request.itemName}" 신청을 삭제하시겠습니까?`)) {
                                          try {
                                            await deleteCookieShopRequest(user.uid, request.id);
                                            setCookieShopRequests(prev => prev.filter(r => r.id !== request.id));
                                            toast.success('신청이 삭제되었습니다.');
                                          } catch (error) {
                                            console.error('Failed to delete request:', error);
                                            toast.error('삭제에 실패했습니다.');
                                          }
                                        }
                                      }}
                                    >
                                      삭제
                                    </Button>
                                  </div>
                                </div>
                                {request.teacherResponse && (
                                  <p className="mt-2 text-sm text-gray-600 bg-white p-2 rounded">
                                    💬 {request.teacherResponse}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </>
                )}
              </>
            )}
          </TabsContent>

          {/* 팀 탭 */}
          <TabsContent value="teams" className="space-y-6">
            {/* 팀 모드 토글 */}
            <div className="flex gap-2 p-1 bg-gray-100 rounded-lg w-fit" data-tutorial="team-mode-toggle">
              <button
                onClick={() => setTeamTabMode('manage')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  teamTabMode === 'manage'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                data-tutorial="team-manage-tab"
              >
                👥 팀 관리
              </button>
              <button
                onClick={() => {
                  setTeamTabMode('status');
                  if (selectedClass) {
                    loadTeamStatus();
                  }
                }}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  teamTabMode === 'status'
                    ? 'bg-white text-green-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                data-tutorial="team-status-tab"
              >
                📊 팀 현황
              </button>
            </div>

            {!selectedClass ? (
              <Card>
                <CardContent className="py-12 text-center text-gray-500">
                  👆 상단에서 학급을 선택해주세요
                </CardContent>
              </Card>
            ) : teamTabMode === 'manage' ? (
              <>
                {/* 팀 생성 */}
                <Card>
                  <CardHeader>
                    <CardTitle>👥 팀 관리</CardTitle>
                    <CardDescription>학생들을 팀으로 나누어 관리하세요</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* 빠른 팀 생성 + 학생 자동 배치 */}
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <p className="text-sm font-medium text-blue-700 mb-2">⚡ 빠른 팀 생성 (기존 팀 삭제 후 새로 생성)</p>
                      <div className="flex flex-wrap gap-2">
                        {[2, 3, 4, 5, 6].map((num) => (
                          <Button
                            key={num}
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              if (!user || !selectedClass) return;
                              if (students.length === 0) {
                                toast.error('학생 목록을 먼저 등록해주세요.');
                                return;
                              }

                              // 기존 팀 모두 삭제
                              for (const team of teams) {
                                await deleteTeam(user.uid, selectedClass, team.teamId);
                              }

                              // 팀 생성 (랜덤 이름 + 일치하는 이모지)
                              const teamIds: string[] = [];
                              const usedIndices = new Set<number>();
                              for (let i = 0; i < num; i++) {
                                // 중복되지 않는 팀 선택
                                let randomIndex: number;
                                do {
                                  randomIndex = Math.floor(Math.random() * TEAM_FLAGS.length);
                                } while (usedIndices.has(randomIndex) && usedIndices.size < TEAM_FLAGS.length);
                                usedIndices.add(randomIndex);

                                const { name: teamName, emoji: teamEmoji } = generateRandomTeamNameWithEmoji();
                                const teamId = await createTeam(user.uid, selectedClass, teamName, teamEmoji);
                                teamIds.push(teamId);
                              }

                              // 학생들을 팀에 균등 배치
                              const shuffledStudents = [...students].sort(() => Math.random() - 0.5);
                              for (let i = 0; i < shuffledStudents.length; i++) {
                                const teamIndex = i % num;
                                await addTeamMember(user.uid, selectedClass, teamIds[teamIndex], shuffledStudents[i].code);
                              }

                              await loadTeams();
                              toast.success(`${num}개 팀에 ${students.length}명의 학생을 배치했습니다!`);
                            }}
                          >
                            {num}팀 만들기
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* 교환 모드 안내 */}
                    {swapStudent1 && (
                      <div className="p-3 bg-blue-100 rounded-lg border border-blue-300 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-blue-700 text-sm">
                            🔄 <strong>{displayStudents.find(s => s.code === swapStudent1.code)?.name}</strong>을(를) 선택했습니다.
                            다른 팀의 학생을 클릭하면 교환됩니다.
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSwapStudent1(null)}
                          className="text-blue-700 border-blue-300"
                        >
                          취소
                        </Button>
                      </div>
                    )}

                    {/* 팀 관리 버튼들 */}
                    {teams.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            if (!user || !selectedClass) return;
                            // 팀원들을 랜덤으로 섞기 (팀 이름/이모지는 유지)
                            const allMembers: string[] = [];
                            teams.forEach(team => {
                              allMembers.push(...team.members);
                            });
                            const shuffled = [...allMembers].sort(() => Math.random() - 0.5);

                            // 각 팀에서 기존 멤버 제거 후 새로 배치
                            let memberIdx = 0;
                            for (const team of teams) {
                              // 기존 멤버 제거
                              for (const member of team.members) {
                                await removeTeamMember(user.uid, selectedClass, team.teamId, member);
                              }
                              // 새 멤버 배치
                              const membersPerTeam = Math.ceil(shuffled.length / teams.length);
                              for (let i = 0; i < membersPerTeam && memberIdx < shuffled.length; i++) {
                                await addTeamMember(user.uid, selectedClass, team.teamId, shuffled[memberIdx]);
                                memberIdx++;
                              }
                            }
                            await loadTeams();
                            toast.success('팀원이 랜덤으로 섞였습니다!');
                          }}
                          className="bg-purple-100 hover:bg-purple-200 text-purple-700"
                        >
                          🔀 팀원 섞기
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            if (!user || !selectedClass) return;
                            if (!confirm('모든 팀을 삭제하시겠습니까?')) return;
                            for (const team of teams) {
                              await deleteTeam(user.uid, selectedClass, team.teamId);
                            }
                            await loadTeams();
                            toast.success('모든 팀이 삭제되었습니다.');
                          }}
                          className="text-red-600 hover:bg-red-50"
                        >
                          🗑️ 전체 삭제
                        </Button>
                      </div>
                    )}

                    {/* 수동 팀 생성 */}
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm font-medium text-gray-700 mb-2">✏️ 수동 팀 생성</p>
                      <div className="flex gap-2">
                        <Input
                          placeholder="팀 이름 (예: 붉은 피닉스)"
                          value={newTeamName}
                          onChange={(e) => setNewTeamName(e.target.value)}
                          className="flex-1"
                        />
                        <select
                          value={newTeamFlag}
                          onChange={(e) => setNewTeamFlag(e.target.value)}
                          className="px-3 py-2 border rounded-md text-2xl"
                        >
                          {TEAM_FLAGS.slice(0, 20).map((flag) => (
                            <option key={flag} value={flag}>{flag}</option>
                          ))}
                        </select>
                        <Button onClick={handleCreateTeam} className="bg-blue-500 hover:bg-blue-600">
                          + 팀 생성
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* 팀 목록 - 블록 형태로 한눈에 보기 */}
                {isLoadingTeams ? (
                  <Card>
                    <CardContent className="py-8 text-center text-gray-500">로딩 중...</CardContent>
                  </Card>
                ) : displayTeams.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-gray-500">생성된 팀이 없습니다.</CardContent>
                  </Card>
                ) : (
                  <Card data-tutorial="team-swap-area">
                    <CardHeader>
                      <CardTitle>📋 팀 현황</CardTitle>
                      <CardDescription>
                        총 {displayTeams.length}개 팀 · 클릭하여 학생 교환
                        {runTutorial && teams.length === 0 && <span className="ml-2 text-amber-500">(튜토리얼 예시)</span>}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {displayTeams.map((team) => (
                          <div
                            key={team.teamId}
                            className="p-3 rounded-xl border-2 border-gray-200 bg-gradient-to-br from-white to-gray-50 hover:border-blue-300 transition-all"
                          >
                            {/* 팀 헤더 */}
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-2xl">{team.flag}</span>
                                <div>
                                  <p className="font-bold text-sm">{team.teamName}</p>
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-amber-600">🍪 {team.teamCookie}</span>
                                    <button
                                      onClick={async () => {
                                        const amount = prompt('추가할 쿠키 개수 (마이너스도 가능)', '10');
                                        if (!amount || !user || !selectedClass) return;
                                        const num = parseInt(amount);
                                        if (isNaN(num)) return;
                                        await updateTeamCookie(user.uid, selectedClass, team.teamId, num);
                                        await loadTeams();
                                        toast.success(`${team.teamName}에 ${num > 0 ? '+' : ''}${num}🍪`);
                                      }}
                                      className="text-[10px] px-1 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-700"
                                    >
                                      +🍪
                                    </button>
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() => handleDeleteTeam(team.teamId)}
                                className="text-red-400 hover:text-red-600 text-xs"
                              >
                                ✕
                              </button>
                            </div>
                            {/* 멤버 목록 */}
                            <div className="flex flex-wrap gap-1">
                              {team.members.map((code) => {
                                const student = displayStudents.find(s => s.code === code);
                                const isSelected = swapStudent1?.code === code;
                                return (
                                  <span
                                    key={code}
                                    onClick={() => handleSelectStudentForSwap(code, team.teamId)}
                                    className={`px-1.5 py-0.5 rounded text-xs cursor-pointer transition-all ${
                                      isSelected
                                        ? 'bg-blue-500 text-white'
                                        : runTutorial
                                          ? 'bg-white border border-blue-300 shadow-sm hover:bg-blue-50'
                                          : 'bg-gray-100 hover:bg-blue-100'
                                    }`}
                                  >
                                    {student?.name || code}
                                  </span>
                                );
                              })}
                              {/* 멤버 추가/관리 버튼 */}
                              <button
                                data-tutorial="team-add-button"
                                onClick={() => {
                                  setTeamForMemberModal(team.teamId);
                                  setEditingTeamName(team.teamName);
                                  setEditingTeamFlag(team.flag);
                                  setShowTeamMemberModal(true);
                                }}
                                className={`px-1.5 py-0.5 rounded text-xs ${
                                  runTutorial
                                    ? 'bg-white border border-green-400 text-green-600 shadow-sm hover:bg-green-50'
                                    : 'bg-green-100 text-green-600 hover:bg-green-200'
                                }`}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              /* 팀 현황 모드 */
              isLoadingTeamStatus ? (
              <Card>
                <CardContent className="py-12 text-center text-gray-500">
                  📊 팀 현황을 불러오는 중...
                </CardContent>
              </Card>
            ) : displayTeams.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-gray-500">
                  생성된 팀이 없습니다. 팀 관리에서 팀을 먼저 만들어주세요.
                </CardContent>
              </Card>
            ) : (
              <div data-tutorial="team-status-content" className="space-y-4">
                {/* 팀별 현황 */}
                {displayTeams.map((team) => {
                  // 팀 결성일 (없으면 아주 오래 전 날짜로 설정)
                  const teamCreatedAtForTotal = team.createdAt?.toDate?.() || new Date(0);
                  const teamCreatedDateStrForTotal = getKoreanDateString(teamCreatedAtForTotal);

                  // 팀 총 쿠키 획득량 계산 (팀 결성 이후만)
                  let teamTotalCookieGain = 0;
                  team.members.forEach(code => {
                    const memberGrass = teamStatusData.get(code) || [];
                    memberGrass.forEach(g => {
                      // 팀 결성일 이후의 데이터만 합산
                      if (g.date >= teamCreatedDateStrForTotal && g.cookieChange > 0) {
                        teamTotalCookieGain += g.cookieChange;
                      }
                    });
                  });

                  // 팀원들의 쿠키 합계 계산
                  const teamTotalCookie = team.members.reduce((sum, code) => {
                    const student = displayStudents.find(s => s.code === code);
                    return sum + (student?.cookie ?? 0);
                  }, 0);

                  return (
                    <Card key={team.teamId}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="flex items-center gap-2">
                            <span className="text-3xl">{team.flag}</span>
                            <span>{team.teamName}</span>
                          </CardTitle>
                          <div className="flex items-center gap-4">
                            <div className="text-center">
                              <p className="text-xs text-gray-500">현재 쿠키</p>
                              <p className="text-xl font-bold text-amber-600">{teamTotalCookie} 🍪</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-gray-500">총 획득량</p>
                              <p className="text-xl font-bold text-green-600">+{teamTotalCookieGain} 🍪</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-gray-500">멤버</p>
                              <p className="text-xl font-bold text-blue-600">{team.members.length}명</p>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {/* 팀원별 현황 */}
                        <div className="space-y-4">
                          {team.members.map((code) => {
                            const student = displayStudents.find(s => s.code === code);
                            const memberGrass = teamStatusData.get(code) || [];

                            // 팀 결성일 (없으면 아주 오래 전 날짜로 설정)
                            const teamCreatedAt = team.createdAt?.toDate?.() || new Date(0);
                            const teamCreatedDateStr = getKoreanDateString(teamCreatedAt);

                            // 팀 결성일 이후의 잔디 데이터만 필터링
                            const memberGrassAfterTeam = memberGrass.filter(g => g.date >= teamCreatedDateStr);

                            // 최근 7일간 쿠키 변화량 계산
                            const today = new Date();
                            const recentDays: { date: string; change: number }[] = [];
                            for (let i = 6; i >= 0; i--) {
                              const d = new Date(today);
                              d.setDate(d.getDate() - i);
                              const dateStr = getKoreanDateString(d);
                              const dayData = memberGrassAfterTeam.find(g => g.date === dateStr);
                              recentDays.push({
                                date: dateStr,
                                change: dayData?.cookieChange || 0
                              });
                            }

                            // 총 획득량 (팀 결성 이후만)
                            const totalGain = memberGrassAfterTeam.reduce((sum, g) => sum + (g.cookieChange > 0 ? g.cookieChange : 0), 0);

                            return (
                              <div key={code} className="p-4 bg-gray-50 rounded-xl">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-3">
                                    {student?.profilePhotoUrl && student?.profile.profilePhotoActive ? (
                                      <img
                                        src={student.profilePhotoUrl}
                                        alt={student.name}
                                        className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-md"
                                      />
                                    ) : (
                                      <span className={`text-2xl ${getAnimationClass(student?.profile.animationCode || 'none')}`}>
                                        {student?.profile.emojiCode ? (
                                          (() => {
                                            const item = ALL_SHOP_ITEMS.find(i => i.code === student.profile.emojiCode);
                                            return item?.value || '😊';
                                          })()
                                        ) : '😊'}
                                      </span>
                                    )}
                                    <div>
                                      <p className="font-bold">{student?.name || code}</p>
                                      <p className="text-xs text-gray-500">#{student?.number}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4 text-sm">
                                    <div className="text-center">
                                      <p className="text-gray-500">보유</p>
                                      <p className="font-bold text-amber-600">{student?.cookie ?? 0} 🍪</p>
                                    </div>
                                    <div className="text-center">
                                      <p className="text-gray-500">총 획득</p>
                                      <p className="font-bold text-green-600">+{totalGain} 🍪</p>
                                    </div>
                                  </div>
                                </div>

                                {/* 최근 7일 잔디 */}
                                <div className="flex items-center gap-1">
                                  <span className="text-xs text-gray-400 w-16">최근 7일</span>
                                  <div className="flex gap-1">
                                    {recentDays.map((day, idx) => {
                                      // 3단계: 1개=연초록, 2개=초록, 3개+=진초록
                                      const bgColor = day.change === 0 ? 'bg-gray-200'
                                        : day.change === 1 ? 'bg-green-300'
                                        : day.change === 2 ? 'bg-green-500'
                                        : 'bg-green-700';
                                      return (
                                        <div
                                          key={idx}
                                          className={`w-6 h-6 rounded ${bgColor} flex items-center justify-center`}
                                          title={`${day.date}: +${day.change}🍪`}
                                        >
                                          {day.change > 0 && (
                                            <span className="text-[10px] text-white font-bold">
                                              {day.change > 99 ? '99+' : day.change}
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                  <span className="text-xs text-gray-400 ml-2">
                                    (오늘: {recentDays[6]?.change > 0 ? `+${recentDays[6].change}` : '0'})
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {team.members.length === 0 && (
                          <p className="text-center text-gray-400 py-4">팀원이 없습니다.</p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )
            )}
          </TabsContent>

          {/* 게임센터 탭 */}
          <TabsContent value="gameCenter" className="space-y-6">
            {/* 게임센터 헤더 */}
            <div className="bg-gradient-to-r from-purple-100 to-pink-100 rounded-2xl p-6 text-center border-2 border-purple-200">
              <div className="text-5xl mb-3">🎮</div>
              <h2 className="text-xl font-bold text-purple-800 mb-2">게임센터 관리</h2>
              <p className="text-purple-600 text-sm">
                학생들이 쿠키를 사용해서 즐길 수 있는 다양한 게임을 관리하세요
              </p>
              <div className="mt-4 flex justify-center gap-3">
                <button
                  onClick={closeAllGames}
                  className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-all"
                >
                  🗑️ 모든 클래스 게임 닫기
                </button>
              </div>
            </div>

            {/* 게임 활성화 관리 */}
            <Card>
              <CardHeader>
                <CardTitle>🎯 게임 활성화 관리</CardTitle>
                <CardDescription>학생들에게 공개할 게임을 선택하세요. 비활성화된 게임은 학생 화면에서 숨겨집니다.</CardDescription>
              </CardHeader>
              <CardContent>
              {/* 게임 버튼 그리드 */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                {/* 숫자야구 버튼 */}
                <button
                  onClick={() => setExpandedGame(expandedGame === 'baseball' ? null : 'baseball')}
                  className={`p-3 rounded-xl text-left transition-all h-20 ${
                    expandedGame === 'baseball'
                      ? 'bg-gradient-to-r from-purple-200 to-violet-200 border-2 border-purple-500 shadow-lg scale-[1.02]'
                      : baseballGame
                        ? 'bg-gradient-to-r from-purple-100 to-violet-100 border-2 border-purple-400'
                        : 'bg-gradient-to-r from-purple-50 to-violet-50 border-2 border-purple-200 hover:border-purple-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">⚾</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <h3 className="font-bold text-purple-800 text-sm">숫자야구</h3>
                        {baseballGame && (
                          <span className={`px-1 py-0.5 rounded text-[10px] font-bold ${
                            baseballGame.status === 'playing' ? 'bg-green-500 text-white' : 'bg-amber-500 text-white'
                          }`}>
                            {baseballGame.status === 'playing' ? '진행중' : '대기'}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-purple-600">개인전 · 실시간</p>
                    </div>
                  </div>
                </button>

                {/* 소수결 버튼 */}
                <button
                  onClick={() => setExpandedGame(expandedGame === 'minority' ? null : 'minority')}
                  className={`p-3 rounded-xl text-left transition-all h-20 ${
                    expandedGame === 'minority'
                      ? 'bg-gradient-to-r from-teal-200 to-cyan-200 border-2 border-teal-500 shadow-lg scale-[1.02]'
                      : minorityGame
                        ? 'bg-gradient-to-r from-teal-100 to-cyan-100 border-2 border-teal-400'
                        : 'bg-gradient-to-r from-teal-50 to-cyan-50 border-2 border-teal-200 hover:border-teal-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">⚖️</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <h3 className="font-bold text-teal-800 text-sm">소수결</h3>
                        {minorityGame && (
                          <span className="px-1 py-0.5 rounded text-[10px] font-bold bg-green-500 text-white">진행중</span>
                        )}
                      </div>
                      <p className="text-[10px] text-teal-600">단체전 · 실시간</p>
                    </div>
                  </div>
                </button>

                {/* 총알피하기 버튼 */}
                <button
                  onClick={() => setExpandedGame(expandedGame === 'bulletDodge' ? null : 'bulletDodge')}
                  className={`p-3 rounded-xl text-left transition-all h-20 ${
                    expandedGame === 'bulletDodge'
                      ? 'bg-gradient-to-r from-indigo-200 to-purple-200 border-2 border-indigo-500 shadow-lg scale-[1.02]'
                      : bulletDodgeGame
                        ? 'bg-gradient-to-r from-indigo-100 to-purple-100 border-2 border-indigo-400'
                        : 'bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 hover:border-indigo-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🚀</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <h3 className="font-bold text-indigo-800 text-sm">총알피하기</h3>
                        {bulletDodgeGame && (
                          <span className="px-1 py-0.5 rounded text-[10px] font-bold bg-green-500 text-white">진행중</span>
                        )}
                      </div>
                      <p className="text-[10px] text-indigo-600">개인전 · 점수</p>
                    </div>
                  </div>
                </button>

                {/* 가위바위보 버튼 */}
                <button
                  onClick={() => setExpandedGame(expandedGame === 'rps' ? null : 'rps')}
                  className={`p-3 rounded-xl text-left transition-all h-20 ${
                    expandedGame === 'rps'
                      ? 'bg-gradient-to-r from-green-200 to-emerald-200 border-2 border-green-500 shadow-lg scale-[1.02]'
                      : rpsGame
                        ? 'bg-gradient-to-r from-green-100 to-emerald-100 border-2 border-green-400'
                        : 'bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 hover:border-green-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">✊</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <h3 className="font-bold text-green-800 text-sm">가위바위보</h3>
                        {rpsGame && (
                          <span className="px-1 py-0.5 rounded text-[10px] font-bold bg-green-500 text-white">진행중</span>
                        )}
                      </div>
                      <p className="text-[10px] text-green-600">서바이벌/캔디</p>
                    </div>
                  </div>
                </button>

                {/* 쿠키배틀 버튼 */}
                <button
                  onClick={() => setExpandedGame(expandedGame === 'cookieBattle' ? null : 'cookieBattle')}
                  className={`p-3 rounded-xl text-left transition-all h-20 ${
                    expandedGame === 'cookieBattle'
                      ? 'bg-gradient-to-r from-red-200 to-orange-200 border-2 border-red-500 shadow-lg scale-[1.02]'
                      : cookieBattleGame
                        ? 'bg-gradient-to-r from-red-100 to-orange-100 border-2 border-red-400'
                        : 'bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-200 hover:border-red-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">⚔️</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <h3 className="font-bold text-red-800 text-sm">쿠키배틀</h3>
                        {cookieBattleGame && (
                          <span className="px-1 py-0.5 rounded text-[10px] font-bold bg-green-500 text-white">진행중</span>
                        )}
                      </div>
                      <p className="text-[10px] text-red-600">팀 대결</p>
                    </div>
                  </div>
                </button>

                {/* 끝말잇기 버튼 */}
                <button
                  onClick={() => setExpandedGame(expandedGame === 'wordChain' ? null : 'wordChain')}
                  className={`p-3 rounded-xl text-left transition-all h-20 ${
                    expandedGame === 'wordChain'
                      ? 'bg-gradient-to-r from-emerald-200 to-teal-200 border-2 border-emerald-500 shadow-lg scale-[1.02]'
                      : wordChainGame
                        ? 'bg-gradient-to-r from-emerald-100 to-teal-100 border-2 border-emerald-400'
                        : 'bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200 hover:border-emerald-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🔤</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <h3 className="font-bold text-emerald-800 text-sm">끝말잇기</h3>
                        {wordChainGame && (
                          <span className="px-1 py-0.5 rounded text-[10px] font-bold bg-green-500 text-white">진행중</span>
                        )}
                      </div>
                      <p className="text-[10px] text-emerald-600">실시간 · 턴제</p>
                    </div>
                  </div>
                </button>
              </div>

              {/* 숫자야구 상세 */}
              {expandedGame === 'baseball' && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-purple-50 to-violet-50 border-2 border-purple-300 mb-4">
                  <h3 className="font-bold text-purple-800 mb-3">⚾ 숫자야구 설정</h3>
                  {!selectedClass ? (
                    <div className="bg-amber-50 text-amber-700 p-3 rounded-lg text-center text-sm">
                      ⚠️ 학급을 먼저 선택해주세요
                    </div>
                  ) : !baseballGame ? (
                    // 게임 생성 UI
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">자릿수:</span>
                        <button
                          onClick={() => setBaseballDigits(4)}
                          className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                            baseballDigits === 4
                              ? 'bg-purple-600 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          4자리
                        </button>
                        <button
                          onClick={() => setBaseballDigits(5)}
                          className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                            baseballDigits === 5
                              ? 'bg-purple-600 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          5자리
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">참가 조건:</span>
                        <input
                          type="number"
                          min="0"
                          value={baseballEntryFee}
                          onChange={(e) => setBaseballEntryFee(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-lg text-center"
                          placeholder="0"
                        />
                        <span className="text-sm text-gray-500">일 스트릭🌱</span>
                      </div>
                      <Button
                        onClick={createBaseballGame}
                        disabled={isCreatingGame}
                        className="w-full bg-purple-600 hover:bg-purple-700"
                      >
                        {isCreatingGame ? '생성 중...' : '🎮 게임 방 만들기'}
                      </Button>
                    </div>
                  ) : (
                    // 게임 관리 UI
                    <div className="space-y-3">
                      {/* 게임 상태 */}
                      <div className="flex items-center justify-between bg-white p-3 rounded-lg">
                        <div>
                          <span className="text-sm text-gray-600">상태: </span>
                          <span className={`font-bold ${
                            baseballGame.status === 'waiting' ? 'text-amber-600' :
                            baseballGame.status === 'playing' ? 'text-green-600' : 'text-gray-600'
                          }`}>
                            {baseballGame.status === 'waiting' ? '⏳ 대기중' :
                             baseballGame.status === 'playing' ? '🎮 진행중' : '🏁 종료'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <span>{baseballGame.digits}자리</span>
                          <button
                            onClick={() => setShowBaseballAnswer(!showBaseballAnswer)}
                            className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                              showBaseballAnswer
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {showBaseballAnswer ? `🔓 ${baseballGame.answer}` : '🔒 정답 보기'}
                          </button>
                        </div>
                      </div>

                      {/* 참가자 목록 */}
                      <div className="bg-white p-3 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700">
                            👥 참가자 ({baseballPlayers.length}명)
                          </span>
                          {baseballGame.status === 'playing' && (
                            <span className="text-xs text-green-600">
                              🏆 완료: {baseballPlayers.filter(p => p.rank).length}명
                            </span>
                          )}
                        </div>
                        {baseballPlayers.length === 0 ? (
                          <p className="text-sm text-gray-400 text-center py-2">
                            아직 참가한 학생이 없습니다
                          </p>
                        ) : (
                          <div className="max-h-40 overflow-y-auto space-y-1">
                            {baseballPlayers.map((player, index) => {
                              const playerStudent = displayStudents.find(s => s.code === player.code);
                              return (
                                <div
                                  key={player.code}
                                  className={`flex items-center justify-between px-2 py-1 rounded ${
                                    player.rank ? 'bg-green-50' : 'bg-gray-50'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    {player.rank ? (
                                      <span className={`text-lg ${
                                        player.rank === 1 ? '' : player.rank === 2 ? '' : player.rank === 3 ? '' : ''
                                      }`}>
                                        {player.rank === 1 ? '🥇' : player.rank === 2 ? '🥈' : player.rank === 3 ? '🥉' : `${player.rank}등`}
                                      </span>
                                    ) : (
                                      <span className="text-gray-400 text-sm">⏳</span>
                                    )}
                                    <button
                                      onClick={() => playerStudent && handleStudentDoubleClick(playerStudent)}
                                      className={`text-sm ${player.rank ? 'font-medium text-green-700' : 'text-gray-600'} hover:underline cursor-pointer`}
                                    >
                                      {player.name}
                                    </button>
                                  </div>
                                  {player.rank && (
                                    <span className="text-xs text-gray-500">{player.attempts}회</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* 컨트롤 버튼 */}
                      <div className="flex gap-2">
                        {baseballGame.status === 'waiting' && (
                          <>
                            <Button
                              onClick={startBaseballGame}
                              disabled={baseballPlayers.length === 0}
                              className="flex-1 bg-green-600 hover:bg-green-700"
                            >
                              🚀 게임 시작
                            </Button>
                            <Button
                              onClick={deleteBaseballGame}
                              variant="outline"
                              className="text-red-600 border-red-300 hover:bg-red-50"
                            >
                              삭제
                            </Button>
                          </>
                        )}
                        {baseballGame.status === 'playing' && (
                          <>
                            <Button
                              onClick={endBaseballGame}
                              className="flex-1 bg-amber-600 hover:bg-amber-700"
                            >
                              🏁 게임 종료
                            </Button>
                            <Button
                              onClick={deleteBaseballGame}
                              variant="outline"
                              className="text-red-600 border-red-300 hover:bg-red-50"
                            >
                              삭제
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 소수결 상세 */}
              {expandedGame === 'minority' && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-teal-50 to-cyan-50 border-2 border-teal-300 mb-4">
                  <h3 className="font-bold text-teal-800 mb-3">⚖️ 소수결 설정</h3>
                  {!selectedClass ? (
                    <div className="bg-amber-50 text-amber-700 p-3 rounded-lg text-center text-sm">
                      ⚠️ 학급을 먼저 선택해주세요
                    </div>
                  ) : !minorityGame ? (
                    // 게임 생성 UI
                    <div className="space-y-3">
                      {/* 게임 모드 선택 */}
                      <div className="bg-white p-3 rounded-lg">
                        <p className="font-medium text-teal-700 mb-2 text-sm">🎮 게임 모드</p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setMinorityGameMode('elimination')}
                            className={`p-2 rounded-lg text-xs font-medium transition-all ${
                              minorityGameMode === 'elimination'
                                ? 'bg-teal-500 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            💀 탈락전
                            <p className="font-normal mt-0.5 opacity-80">소수파만 생존</p>
                          </button>
                          <button
                            onClick={() => setMinorityGameMode('score')}
                            className={`p-2 rounded-lg text-xs font-medium transition-all ${
                              minorityGameMode === 'score'
                                ? 'bg-teal-500 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            ⭐ 점수전
                            <p className="font-normal mt-0.5 opacity-80">10문제 점수제</p>
                          </button>
                        </div>
                      </div>
                      <div className="bg-white p-3 rounded-lg text-sm text-gray-600">
                        <p className="font-medium text-teal-700 mb-1">📋 게임 규칙</p>
                        {minorityGameMode === 'elimination' ? (
                          <>
                            <p>· 밸런스 질문이 출제됩니다</p>
                            <p>· A 또는 B 중 하나를 선택!</p>
                            <p>· 소수파(적은 쪽)가 생존</p>
                            <p>· 최후의 1~2명이 승자</p>
                          </>
                        ) : (
                          <>
                            <p>· 총 10개의 질문이 출제됩니다</p>
                            <p>· A 또는 B 중 하나를 선택!</p>
                            <p>· 소수파: 1점, 다수파: 0점</p>
                            <p>· 최종 점수로 순위 결정</p>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">참가 조건:</span>
                        <input
                          type="number"
                          min="0"
                          value={minorityEntryFee}
                          onChange={(e) => setMinorityEntryFee(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-lg text-center"
                          placeholder="0"
                        />
                        <span className="text-sm text-gray-500">일 스트릭🌱</span>
                      </div>
                      <Button
                        onClick={createMinorityGame}
                        disabled={isCreatingMinorityGame}
                        className="w-full bg-teal-600 hover:bg-teal-700"
                      >
                        {isCreatingMinorityGame ? '생성 중...' : '⚖️ 게임 방 만들기'}
                      </Button>
                    </div>
                  ) : (
                    // 게임 관리 UI
                    <div className="space-y-3">
                      <div className="flex items-center justify-between bg-white p-3 rounded-lg">
                        <div>
                          <span className="text-sm text-gray-600">상태: </span>
                          <span className={`font-bold ${
                            minorityGame.status === 'waiting' ? 'text-amber-600' :
                            minorityGame.status === 'question' ? 'text-green-600' :
                            minorityGame.status === 'result' ? 'text-blue-600' : 'text-gray-600'
                          }`}>
                            {minorityGame.status === 'waiting' ? '⏳ 대기중' :
                             minorityGame.status === 'question' ? '❓ 투표중' :
                             minorityGame.status === 'result' ? '📊 결과발표' : '🏁 종료'}
                          </span>
                        </div>
                        <span className="text-sm text-teal-600 font-medium">
                          라운드 {minorityGame.currentRound}
                        </span>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          onClick={deleteMinorityGame}
                          variant="outline"
                          className="flex-1 text-red-600 border-red-300 hover:bg-red-50"
                        >
                          게임 삭제
                        </Button>
                      </div>
                      <p className="text-xs text-center text-gray-500">
                        게임 관리는 새 창에서 진행됩니다
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* 총알피하기 상세 */}
              {expandedGame === 'bulletDodge' && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-300 mb-4">
                  <h3 className="font-bold text-indigo-800 mb-3">🚀 총알피하기 설정</h3>
                  {!selectedClass ? (
                    <div className="bg-amber-50 text-amber-700 p-3 rounded-lg text-center text-sm">
                      ⚠️ 학급을 먼저 선택해주세요
                    </div>
                  ) : !bulletDodgeGame ? (
                    <div className="space-y-3">
                      <div className="bg-white p-3 rounded-lg text-sm text-gray-600">
                        <p className="font-medium text-indigo-700 mb-1">📋 게임 규칙</p>
                        <p>· 화면을 터치하여 우주선을 조종</p>
                        <p>· 날아오는 총알을 피하세요!</p>
                        <p>· 생존 시간이 점수로 기록됩니다</p>
                        <p>· 최고 기록 경쟁!</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">참가 조건:</span>
                        <input
                          type="number"
                          min="0"
                          value={bulletDodgeEntryFee}
                          onChange={(e) => setBulletDodgeEntryFee(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-lg text-center"
                          placeholder="0"
                        />
                        <span className="text-sm text-gray-500">일 스트릭🌱</span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={createBulletDodgeGame}
                          disabled={isCreatingBulletDodge}
                          className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                        >
                          {isCreatingBulletDodge ? '생성 중...' : '🚀 게임 방 만들기'}
                        </Button>
                        <Button
                          onClick={() => {
                            // 테스트용 게임 URL 생성 (게임 데이터 없이 바로 플레이 가능)
                            const testUrl = `${window.location.origin}?game=bullet-dodge&gameId=test_${Date.now()}&studentCode=teacher_test&studentName=${encodeURIComponent(teacher?.name || '선생님')}&testMode=true`;
                            window.open(testUrl, '_blank', 'width=400,height=700');
                          }}
                          variant="outline"
                          className="border-indigo-300 text-indigo-600 hover:bg-indigo-50"
                        >
                          🎮 테스트
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between bg-white p-3 rounded-lg">
                        <div>
                          <span className="text-sm text-gray-600">상태: </span>
                          <span className={`font-bold ${
                            bulletDodgeGame.status === 'waiting' ? 'text-amber-600' :
                            bulletDodgeGame.status === 'playing' ? 'text-green-600' : 'text-gray-600'
                          }`}>
                            {bulletDodgeGame.status === 'waiting' ? '⏳ 대기중' :
                             bulletDodgeGame.status === 'playing' ? '🎮 진행중' : '🏁 종료'}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          onClick={deleteBulletDodgeGame}
                          variant="outline"
                          className="flex-1 text-red-600 border-red-300 hover:bg-red-50"
                        >
                          게임 삭제
                        </Button>
                      </div>
                      <p className="text-xs text-center text-gray-500">
                        게임 관리는 새 창에서 진행됩니다
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* 가위바위보 상세 */}
              {expandedGame === 'rps' && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 mb-4">
                  <h3 className="font-bold text-green-800 mb-3">✊ 가위바위보 설정</h3>
                  {!selectedClass ? (
                    <div className="bg-amber-50 text-amber-700 p-3 rounded-lg text-center text-sm">
                      ⚠️ 학급을 먼저 선택해주세요
                    </div>
                  ) : !rpsGame ? (
                    <div className="space-y-3">
                      <div className="bg-white p-3 rounded-lg text-sm text-gray-600">
                        <p className="font-medium text-green-700 mb-1">🎮 게임 모드 선택</p>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          <button
                            onClick={() => setSelectedRpsMode('survivor')}
                            className={`p-2 rounded-lg text-xs font-medium transition-all ${
                              selectedRpsMode === 'survivor'
                                ? 'bg-green-500 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            🏆 최후의 승자
                          </button>
                          <button
                            onClick={() => setSelectedRpsMode('candy15')}
                            className={`p-2 rounded-lg text-xs font-medium transition-all ${
                              selectedRpsMode === 'candy15'
                                ? 'bg-amber-500 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            🍬 1.5배 이벤트
                          </button>
                          <button
                            onClick={() => setSelectedRpsMode('candy12')}
                            className={`p-2 rounded-lg text-xs font-medium transition-all ${
                              selectedRpsMode === 'candy12'
                                ? 'bg-amber-400 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            🍬 1.2배 이벤트
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                          {selectedRpsMode === 'survivor'
                            ? '진 사람은 탈락! 최후의 1인이 될 때까지!'
                            : selectedRpsMode === 'candy15'
                              ? '이기면 캔디 1.5배! (비기면 X)'
                              : '이기면 캔디 1.2배! (비겨도 원금)'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">참가 조건:</span>
                        <input
                          type="number"
                          min="0"
                          value={rpsEntryFee}
                          onChange={(e) => setRpsEntryFee(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-lg text-center"
                          placeholder="0"
                        />
                        <span className="text-sm text-gray-500">일 스트릭🌱</span>
                      </div>
                      <Button
                        onClick={createRpsGame}
                        disabled={isCreatingRps}
                        className="w-full bg-green-600 hover:bg-green-700"
                      >
                        {isCreatingRps ? '생성 중...' : '✊ 게임 방 만들기'}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between bg-white p-3 rounded-lg">
                        <div>
                          <span className="text-sm text-gray-600">모드: </span>
                          <span className="font-bold text-green-700">
                            {rpsGame.gameMode === 'survivor' ? '🏆 최후의 승자' :
                             rpsGame.gameMode === 'candy15' ? '🍬 1.5배' : '🍬 1.2배'}
                          </span>
                        </div>
                        <div>
                          <span className="text-sm text-gray-600">라운드: </span>
                          <span className="font-bold text-green-700">{rpsGame.round}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => {
                            const teacherGameUrl = `${window.location.origin}?game=rps-teacher&gameId=${rpsGame.id}`;
                            window.open(teacherGameUrl, '_blank', 'width=800,height=900');
                          }}
                          className="flex-1 bg-green-600 hover:bg-green-700"
                        >
                          🎮 관리 창 열기
                        </Button>
                        <Button
                          onClick={deleteRpsGame}
                          variant="outline"
                          className="text-red-600 border-red-300 hover:bg-red-50"
                        >
                          삭제
                        </Button>
                      </div>
                      <p className="text-xs text-center text-gray-500">
                        게임 관리는 새 창에서 진행됩니다
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* 쿠키배틀 상세 */}
              {expandedGame === 'cookieBattle' && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-300 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-red-800">⚔️ 쿠키배틀 설정</h3>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => { setShowCookieBattleHelp(true); setCookieBattleHelpPage(0); }}
                        variant="outline"
                        size="sm"
                        className="text-red-600 border-red-300 hover:bg-red-50"
                      >
                        📖 사용법
                      </Button>
                      {!cookieBattleGame && (
                        <Button
                          onClick={createCookieBattleGame}
                          disabled={isCreatingCookieBattle}
                          className="bg-red-600 hover:bg-red-700"
                          size="sm"
                        >
                          {isCreatingCookieBattle ? '팀 확인 중...' : '⚔️ 게임 생성'}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* 초기 자원 모드 선택 (게임 없을 때만) */}
                  {!cookieBattleGame && (
                    <div className="mt-4 p-3 bg-white/50 rounded-lg">
                      <p className="text-xs font-medium text-red-700 mb-2">💰 초기 자원 모드</p>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => setSelectedCookieBattleResourceMode('memberCount')}
                          className={`p-2 rounded-lg border-2 transition-all ${
                            selectedCookieBattleResourceMode === 'memberCount'
                              ? 'border-amber-500 bg-amber-100'
                              : 'border-gray-200 bg-white hover:border-amber-300'
                          }`}
                        >
                          <span className="text-lg">👥</span>
                          <p className="text-xs font-bold">인원 수</p>
                          <p className="text-[10px] text-gray-500">팀원 × 100</p>
                        </button>
                        <button
                          onClick={() => setSelectedCookieBattleResourceMode('ownedCookie')}
                          className={`p-2 rounded-lg border-2 transition-all ${
                            selectedCookieBattleResourceMode === 'ownedCookie'
                              ? 'border-amber-500 bg-amber-100'
                              : 'border-gray-200 bg-white hover:border-amber-300'
                          }`}
                        >
                          <span className="text-lg">🍪</span>
                          <p className="text-xs font-bold">보유 쿠키</p>
                          <p className="text-[10px] text-gray-500">팀원 합계</p>
                        </button>
                        <button
                          onClick={() => setSelectedCookieBattleResourceMode('earnedCookie')}
                          className={`p-2 rounded-lg border-2 transition-all ${
                            selectedCookieBattleResourceMode === 'earnedCookie'
                              ? 'border-amber-500 bg-amber-100'
                              : 'border-gray-200 bg-white hover:border-amber-300'
                          }`}
                        >
                          <span className="text-lg">🏆</span>
                          <p className="text-xs font-bold">팀 쿠키</p>
                          <p className="text-[10px] text-gray-500">획득 쿠키</p>
                        </button>
                      </div>

                      <p className="text-[10px] text-gray-500 mt-2 text-center">
                        팀 수: {teams.length}개
                      </p>
                    </div>
                  )}

                  {/* 진행 중인 게임이 있을 때 */}
                  {cookieBattleGame && (
                    <div className="mt-4 p-4 bg-white/80 rounded-lg space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <div>
                          <span className="text-gray-600">상태: </span>
                          <span className={`font-bold ${
                            cookieBattleGame.status === 'waiting' ? 'text-amber-600' :
                            cookieBattleGame.status === 'betting' ? 'text-blue-600' :
                            cookieBattleGame.status === 'result' ? 'text-green-600' :
                            'text-gray-600'
                          }`}>
                            {cookieBattleGame.status === 'waiting' ? '⏳ 대기중' :
                             cookieBattleGame.status === 'betting' ? '🎯 배팅중' :
                             cookieBattleGame.status === 'result' ? '⚔️ 결과 발표' :
                             '🏁 종료'}
                          </span>
                        </div>
                        <div>
                          <span className="text-sm text-gray-600">라운드: </span>
                          <span className="font-bold text-red-700">{cookieBattleGame.round}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => {
                            const teacherGameUrl = `${window.location.origin}?game=cookie-battle-teacher&gameId=${cookieBattleGame.id}`;
                            window.open(teacherGameUrl, '_blank', 'width=1200,height=900');
                          }}
                          className="flex-1 bg-red-600 hover:bg-red-700"
                        >
                          🎮 관리 창 열기
                        </Button>
                        <Button
                          onClick={deleteCookieBattleGame}
                          variant="outline"
                          className="text-red-600 border-red-300 hover:bg-red-50"
                        >
                          삭제
                        </Button>
                      </div>
                      <p className="text-xs text-center text-gray-500">
                        게임 관리는 새 창에서 진행됩니다
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* 끝말잇기 상세 */}
              {expandedGame === 'wordChain' && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-300 mb-4">
                  <h3 className="font-bold text-emerald-800 mb-3">🔤 끝말잇기 설정</h3>
                  {!selectedClass ? (
                    <div className="bg-amber-50 text-amber-700 p-3 rounded-lg text-center text-sm">
                      ⚠️ 학급을 먼저 선택해주세요
                    </div>
                  ) : !wordChainGame ? (
                    <div className="space-y-3">
                      <div className="bg-white p-3 rounded-lg text-sm text-gray-600">
                        <p className="font-medium text-green-700 mb-1">📋 게임 규칙</p>
                        <p>· 앞 단어의 끝 글자로 시작하는 단어 입력</p>
                        <p>· 국립국어원 사전에 있는 단어만 인정</p>
                        <p>· 제한 시간 내에 입력해야 함</p>
                      </div>

                      {/* 게임 모드 선택 */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setWordChainGameMode('survival')}
                          className={`p-2 rounded-lg border-2 transition-all ${
                            wordChainGameMode === 'survival'
                              ? 'border-red-500 bg-red-100'
                              : 'border-gray-200 bg-white hover:border-red-300'
                          }`}
                        >
                          <span className="text-lg">💀</span>
                          <p className="text-xs font-bold">생존모드</p>
                          <p className="text-[10px] text-gray-500">탈락전</p>
                        </button>
                        <button
                          onClick={() => setWordChainGameMode('score')}
                          className={`p-2 rounded-lg border-2 transition-all ${
                            wordChainGameMode === 'score'
                              ? 'border-yellow-500 bg-yellow-100'
                              : 'border-gray-200 bg-white hover:border-yellow-300'
                          }`}
                        >
                          <span className="text-lg">⭐</span>
                          <p className="text-xs font-bold">점수모드</p>
                          <p className="text-[10px] text-gray-500">라운드제</p>
                        </button>
                      </div>

                      {/* 설정 */}
                      <div className="bg-white/50 p-3 rounded-lg space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">⏱️ 제한시간</span>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="5"
                              max="60"
                              value={wordChainTimeLimit}
                              onChange={(e) => setWordChainTimeLimit(Math.min(60, Math.max(5, parseInt(e.target.value) || 15)))}
                              className="w-14 px-2 py-1 text-sm border border-gray-300 rounded text-center"
                            />
                            <span className="text-xs text-gray-500">초</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">📏 글자 수</span>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="2"
                              max="5"
                              value={wordChainMinLength}
                              onChange={(e) => setWordChainMinLength(Math.min(5, Math.max(2, parseInt(e.target.value) || 2)))}
                              className="w-12 px-2 py-1 text-sm border border-gray-300 rounded text-center"
                            />
                            <span className="text-xs">~</span>
                            <input
                              type="number"
                              min="5"
                              max="20"
                              value={wordChainMaxLength}
                              onChange={(e) => setWordChainMaxLength(Math.min(20, Math.max(5, parseInt(e.target.value) || 10)))}
                              className="w-12 px-2 py-1 text-sm border border-gray-300 rounded text-center"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">🚫 한방단어 금지</span>
                          <Checkbox
                            checked={wordChainBanKiller}
                            onCheckedChange={(checked) => setWordChainBanKiller(checked as boolean)}
                          />
                        </div>
                        {wordChainGameMode === 'score' && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">🔄 라운드 수</span>
                            <input
                              type="number"
                              min="5"
                              max="30"
                              value={wordChainMaxRounds}
                              onChange={(e) => setWordChainMaxRounds(Math.min(30, Math.max(5, parseInt(e.target.value) || 10)))}
                              className="w-14 px-2 py-1 text-sm border border-gray-300 rounded text-center"
                            />
                          </div>
                        )}
                      </div>

                      <Button
                        onClick={createWordChainGame}
                        disabled={isCreatingWordChain}
                        className="w-full bg-green-600 hover:bg-green-700"
                      >
                        {isCreatingWordChain ? '생성 중...' : '🔤 게임 방 만들기'}
                      </Button>
                    </div>
                  ) : (
                    // 게임 관리 UI
                    <div className="space-y-3">
                      <div className="flex items-center justify-between bg-white p-3 rounded-lg">
                        <div>
                          <span className="text-sm text-gray-600">상태: </span>
                          <span className={`font-bold ${
                            wordChainGame.status === 'waiting' ? 'text-amber-600' :
                            wordChainGame.status === 'playing' ? 'text-green-600' : 'text-gray-600'
                          }`}>
                            {wordChainGame.status === 'waiting' ? '⏳ 대기중' :
                             wordChainGame.status === 'playing' ? '🎮 진행중' : '🏁 종료'}
                          </span>
                        </div>
                        <div className="text-sm">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            wordChainGame.gameMode === 'survival' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-600'
                          }`}>
                            {wordChainGame.gameMode === 'survival' ? '생존' : '점수'}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            const teacherGameUrl = `${window.location.origin}?game=word-chain-teacher&gameId=${wordChainGame.id}`;
                            window.open(teacherGameUrl, '_blank', 'width=800,height=900');
                          }}
                          className="flex-1 px-4 py-2 rounded-md text-sm font-medium bg-green-600 hover:bg-green-700 text-white transition-colors"
                        >
                          🎮 관리 창 열기
                        </button>
                        <button
                          onClick={deleteWordChainGame}
                          className="px-4 py-2 rounded-md text-sm font-medium border border-red-300 bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                        >
                          삭제
                        </button>
                      </div>
                      <p className="text-xs text-center text-gray-500">
                        게임 관리는 새 창에서 진행됩니다
                      </p>
                    </div>
                  )}
                </div>
              )}
              </CardContent>
            </Card>

            {/* 안내 */}
            <Card className="bg-gray-50 border-dashed">
              <CardContent className="py-4 text-center text-gray-500 text-sm">
                <p>🔜 더 많은 게임이 곧 추가될 예정이에요!</p>
                <p className="text-xs mt-1">숫자야구는 지금 바로 플레이할 수 있어요!</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 소원 탭 - 모든 클래스룸에서 공유 */}
          <TabsContent value="wishes" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>⭐ 소원의 돌 관리</CardTitle>
                <CardDescription>모든 학급에서 공유되는 소원을 확인하고 선정하세요</CardDescription>
              </CardHeader>
              <CardContent>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <Button onClick={loadWishes} disabled={isLoadingWishes} variant="outline">
                      {isLoadingWishes ? '로딩 중...' : '🔄 새로고침'}
                    </Button>
                    <div className="border-l border-gray-300 mx-1" />
                    <Button
                      variant={wishSortOrder === 'latest' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setWishSortOrder('latest')}
                    >
                      🕐 최신순
                    </Button>
                    <Button
                      variant={wishSortOrder === 'likes' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setWishSortOrder('likes')}
                    >
                      ❤️ 좋아요순
                    </Button>
                  </div>

                  {/* 그룹 필터 */}
                  {classGroups.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4 p-3 bg-purple-50 rounded-lg">
                      <span className="text-sm text-purple-700 font-medium flex items-center">🔗 그룹별 보기:</span>
                      <Button
                        variant={wishGroupFilter === null ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => { setWishGroupFilter(null); setWishPage(1); }}
                        className={wishGroupFilter === null ? 'bg-purple-600 hover:bg-purple-700' : ''}
                      >
                        전체
                      </Button>
                      {classGroups.map(group => (
                        <Button
                          key={group.id}
                          variant={wishGroupFilter === group.id ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => { setWishGroupFilter(group.id); setWishPage(1); }}
                          className={wishGroupFilter === group.id ? 'bg-purple-600 hover:bg-purple-700' : ''}
                        >
                          {group.name} ({group.classIds.length}개 학급)
                        </Button>
                      ))}
                    </div>
                  )}

                  {isLoadingWishes ? (
                    <p className="text-center py-8 text-gray-500">로딩 중...</p>
                  ) : displayWishes.length === 0 ? (
                    <p className="text-center py-8 text-gray-500">등록된 소원이 없습니다.</p>
                  ) : (
                    <>
                      <div className="space-y-3" data-tutorial="wishes-container">
                        {(() => {
                          // 그룹 필터 적용
                          const selectedGroup = wishGroupFilter ? classGroups.find(g => g.id === wishGroupFilter) : null;
                          const filteredWishes = selectedGroup
                            ? displayWishes.filter(w => selectedGroup.classIds.includes(w.classId))
                            : displayWishes;

                          if (filteredWishes.length === 0) {
                            return (
                              <p className="text-center py-8 text-gray-500">
                                {selectedGroup ? `"${selectedGroup.name}" 그룹에 해당하는 소원이 없습니다.` : '등록된 소원이 없습니다.'}
                              </p>
                            );
                          }

                          const sortedWishes = [...filteredWishes].sort((a, b) => wishSortOrder === 'likes'
                            ? b.likes.length - a.likes.length
                            : (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
                          );
                          const startIndex = (wishPage - 1) * WISHES_PER_PAGE;
                          const paginatedWishes = sortedWishes.slice(startIndex, startIndex + WISHES_PER_PAGE);
                          return paginatedWishes.map((wish) => (
                            <div
                              key={wish.id}
                              className={`p-4 rounded-lg ${wish.isGranted ? '' : 'bg-white'}`}
                              style={{
                                border: wish.isGranted
                                  ? '3px solid transparent'
                                  : '1px solid rgb(229 231 235)',
                                backgroundImage: wish.isGranted
                                  ? 'linear-gradient(to right, rgb(254 243 199), rgb(253 230 138), rgb(254 243 199)), linear-gradient(to right, rgb(239 68 68), rgb(234 179 8), rgb(34 197 94), rgb(59 130 246), rgb(168 85 247))'
                                  : undefined,
                                backgroundOrigin: 'border-box',
                                backgroundClip: wish.isGranted ? 'padding-box, border-box' : undefined,
                              }}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-medium">{wish.studentName}</span>
                                    {wish.isGranted && (
                                      <span className="px-2 py-0.5 bg-gradient-to-r from-amber-400 to-orange-400 text-white rounded text-xs">
                                        ✨ 선정됨
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-gray-700">{wish.content}</p>
                                  {wish.isGranted && wish.grantedMessage && (
                                    <p className="text-sm text-purple-600 mt-2 italic">
                                      💬 어디선가 들려오는 목소리: "{wish.grantedMessage}"
                                    </p>
                                  )}
                                  <p className="text-xs text-gray-400 mt-1">❤️ {wish.likes.length}</p>
                                </div>
                                <div className="flex gap-2">
                                  {!wish.isGranted && (
                                    <Button
                                      size="sm"
                                      className="bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-500 hover:to-orange-500"
                                      onClick={() => {
                                        setGrantingWish(wish);
                                        setGrantMessage('');
                                      }}
                                    >
                                      ✨ 선정
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-500"
                                    onClick={() => handleDeleteWish(wish.id)}
                                  >
                                    삭제
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                      {/* 페이지네이션 */}
                      {(() => {
                        const selectedGroup = wishGroupFilter ? classGroups.find(g => g.id === wishGroupFilter) : null;
                        const filteredCount = selectedGroup
                          ? displayWishes.filter(w => selectedGroup.classIds.includes(w.classId)).length
                          : displayWishes.length;
                        const totalPages = Math.ceil(filteredCount / WISHES_PER_PAGE);
                        if (filteredCount <= WISHES_PER_PAGE) return null;
                        return (
                          <div className="flex justify-center items-center gap-2 mt-4">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setWishPage(p => Math.max(1, p - 1))}
                              disabled={wishPage === 1}
                            >
                              ◀ 이전
                            </Button>
                            <span className="text-sm text-gray-600">
                              {wishPage} / {totalPages} 페이지 ({filteredCount}개)
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setWishPage(p => Math.min(totalPages, p + 1))}
                              disabled={wishPage >= totalPages}
                            >
                              다음 ▶
                            </Button>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </CardContent>
            </Card>
          </TabsContent>

          {/* 기능 탭 */}
          <TabsContent value="features" className="space-y-6">
            {/* 학습 도구 헤더 */}
            <div className="bg-gradient-to-r from-cyan-100 to-blue-100 rounded-2xl p-6 text-center border-2 border-cyan-200">
              <div className="text-5xl mb-3">🔧</div>
              <h2 className="text-xl font-bold text-cyan-800 mb-2">학습 도구 관리</h2>
              <p className="text-cyan-600 text-sm">
                다양한 학습 도구를 활용하여 수업을 진행하세요
              </p>
            </div>

            {/* 워드클라우드 */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-300">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-4">
                  <span className="text-3xl">☁️</span>
                  <div>
                    <h3 className="font-bold text-blue-800">워드클라우드</h3>
                    <p className="text-xs text-blue-600">학생들의 키워드를 실시간으로 수집</p>
                    <span className="inline-block mt-1 bg-blue-100 text-blue-600 px-2 py-0.5 rounded text-xs">실시간 · 모두 참여</span>
                  </div>
                </div>
                <span className="px-2 py-1 bg-green-500 text-white rounded-full text-xs font-bold">활성화</span>
              </div>

              {!selectedClass ? (
                <div className="bg-amber-50 text-amber-700 p-3 rounded-lg text-center text-sm">
                  ⚠️ 학급을 먼저 선택해주세요
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-white p-3 rounded-lg">
                    <span className="text-sm text-gray-600">학생들이 참여할 수 있는 세션을 시작하세요</span>
                  </div>
                  <Button
                    onClick={() => {
                      const wordCloudUrl = `${window.location.origin}?game=wordcloud-teacher&teacherId=${user.uid}&classId=${selectedClass}`;
                      window.open(wordCloudUrl, '_blank', 'width=1200,height=900');
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    🚀 워드클라우드 시작
                  </Button>
                </div>
              )}
            </div>

            {/* 화이트보드 */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-300 opacity-60">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-4">
                  <span className="text-3xl">✏️</span>
                  <div>
                    <h3 className="font-bold text-purple-800">화이트보드</h3>
                    <p className="text-xs text-purple-600">실시간 협업 그리기 도구</p>
                    <span className="inline-block mt-1 bg-purple-100 text-purple-600 px-2 py-0.5 rounded text-xs">실시간 · 팀 협업</span>
                  </div>
                </div>
                <span className="px-2 py-1 bg-gray-400 text-white rounded-full text-xs font-bold">준비중</span>
              </div>
              <div className="bg-white p-3 rounded-lg text-center">
                <span className="text-sm text-gray-500">🔜 곧 만나요!</span>
              </div>
            </div>
          </TabsContent>

          {/* 프로필 확인 탭 */}
          <TabsContent value="profiles" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>👤 학생 프로필 확인</CardTitle>
                <CardDescription>학생들의 프로필을 구경해보세요!</CardDescription>
              </CardHeader>
              <CardContent>
                {!selectedClass ? (
                  <p className="text-center text-gray-500 py-8">학급을 먼저 선택해주세요</p>
                ) : displayStudents.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">학생이 없습니다</p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                    {displayStudents.map((student) => (
                      <button
                        key={student.code}
                        onClick={() => handleSelectProfileStudent(student)}
                        className="p-3 rounded-xl hover:shadow-md transition-all flex flex-col items-center"
                        style={{
                          border: `2px solid ${getBorderColor(student.profile.buttonBorderCode)}`,
                          ...(isGradientFill(student.profile.buttonFillCode)
                            ? { backgroundImage: getGradientStyle(student.profile.buttonFillCode) }
                            : { backgroundColor: getFillColor(student.profile.buttonFillCode) }
                          ),
                        }}
                      >
                        <div className={`text-3xl mb-1 ${getAnimationClass(student.profile.animationCode || 'none')}`}>
                          {student.profilePhotoUrl && student.profile.profilePhotoActive ? (
                            <img
                              src={student.profilePhotoUrl}
                              alt={student.name}
                              className="w-12 h-12 mx-auto rounded-full object-cover border-2 border-white shadow-md"
                            />
                          ) : student.profile.profileBadgeKey && student.badges?.[student.profile.profileBadgeKey]?.hasBadge ? (
                            <img
                              src={student.badges[student.profile.profileBadgeKey].imgUrl}
                              alt={student.badges[student.profile.profileBadgeKey].title}
                              className="w-10 h-10 mx-auto rounded"
                            />
                          ) : getEmojiFromCode(student.profile.emojiCode) || (
                            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                              <span className="text-gray-400 text-xs">👤</span>
                            </div>
                          )}
                        </div>
                        <p className={`font-medium text-sm truncate w-full text-center ${getNameEffectClass(student.profile.nameEffectCode)}`}>
                          {student.name}
                        </p>
                        {student.profile.title && (
                          <p className={`text-xs truncate w-full text-center ${getTitleColorClass(student.profile.titleColorCode)}`}>
                            {student.profile.title}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 설정 탭 */}
          <TabsContent value="settings">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>⚙️ 계정 정보</CardTitle>
                {!isEditingProfile && (
                  <Button variant="outline" size="sm" onClick={startEditingProfile}>
                    ✏️ 프로필 수정
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditingProfile ? (
                  <>
                    <div>
                      <label className="text-sm font-medium text-gray-500">이메일</label>
                      <p className="font-medium text-gray-400">{teacher?.email}</p>
                      <p className="text-xs text-gray-400 mt-1">이메일 변경은 아래 별도 섹션에서 가능합니다.</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">이름</label>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="이름을 입력하세요"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">학교</label>
                      <Input
                        value={editSchoolName}
                        onChange={(e) => setEditSchoolName(e.target.value)}
                        placeholder="학교 이름을 입력하세요"
                        className="mt-1"
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button onClick={saveProfile} disabled={isSavingProfile}>
                        {isSavingProfile ? '저장 중...' : '💾 저장'}
                      </Button>
                      <Button variant="outline" onClick={cancelEditingProfile} disabled={isSavingProfile}>
                        취소
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="text-sm font-medium text-gray-500">이메일</label>
                      <p className="font-medium">{teacher?.email}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">이름</label>
                      <p className="font-medium">{teacher?.name}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">학교</label>
                      <p className="font-medium">{teacher?.schoolName}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">다했니 API 키</label>
                      <p className="font-mono text-xs bg-gray-100 p-2 rounded">
                        {teacher?.dahandinApiKey ? '••••••••••••••••' : '-'}
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* 이메일 변경 카드 */}
            <Card className="mt-4">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>📧 이메일 변경</CardTitle>
                {!isEditingEmail && (
                  <Button variant="outline" size="sm" onClick={startEditingEmail}>
                    ✏️ 변경하기
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {isEditingEmail ? (
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500">현재 이메일</label>
                      <p className="font-medium text-gray-400">{teacher?.email}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">새 이메일</label>
                      <Input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="새 이메일 주소를 입력하세요"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">현재 비밀번호</label>
                      <Input
                        type="password"
                        value={emailPassword}
                        onChange={(e) => setEmailPassword(e.target.value)}
                        placeholder="보안을 위해 현재 비밀번호를 입력하세요"
                        className="mt-1"
                      />
                      <p className="text-xs text-gray-400 mt-1">이메일 변경을 위해 현재 비밀번호 확인이 필요합니다.</p>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button onClick={handleChangeEmail} disabled={isChangingEmail}>
                        {isChangingEmail ? '변경 중...' : '💾 이메일 변경'}
                      </Button>
                      <Button variant="outline" onClick={cancelEditingEmail} disabled={isChangingEmail}>
                        취소
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-gray-600">
                      현재 이메일: <span className="font-medium">{teacher?.email}</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-2">
                      이메일을 변경하면 로그인 시 새 이메일을 사용해야 합니다.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* 학생 상세 모달 - 쿠키 부여 기능 포함 */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={handleCloseStudentModal}>
          <div
            className="bg-white rounded-3xl shadow-2xl border-4 border-amber-200 max-h-[90vh] overflow-y-auto"
            style={{ width: '420px' }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            {/* 헤더 - 학생 정보 */}
            <div className="p-4 border-b flex items-center gap-3">
              {selectedStudent.profilePhotoUrl && selectedStudent.profile.profilePhotoActive ? (
                <img
                  src={selectedStudent.profilePhotoUrl}
                  alt={selectedStudent.name}
                  className="w-12 h-12 rounded-full object-cover border-2 border-gray-300 shadow-md"
                />
              ) : (
                <div className="text-3xl">
                  {selectedStudent.profile?.emojiCode === 'emoji_00' ? '😊' : '🌟'}
                </div>
              )}
              <div className="flex-1">
                <h3 className="font-bold text-gray-800 text-lg">{selectedStudent.name}</h3>
                <p className="text-sm text-gray-500">{selectedStudent.number}번 · {selectedStudent.code}</p>
              </div>
              <button onClick={handleCloseStudentModal} className="text-gray-400 hover:text-gray-600 text-2xl p-1">×</button>
            </div>

            {/* 쿠키 & 캔디 현황 */}
            <div className="px-4 py-4 bg-gradient-to-r from-amber-50 to-pink-50 grid grid-cols-2 gap-3 text-center">
              <div className="bg-white rounded-lg p-3 border border-amber-200">
                <p className="text-amber-600 font-bold text-2xl">{selectedStudent.cookie}</p>
                <p className="text-xs text-amber-700">🍪 다했니 쿠키</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-pink-200">
                <p className="text-pink-600 font-bold text-2xl">{selectedStudent.jelly ?? selectedStudent.cookie}</p>
                <p className="text-xs text-pink-700">🍭 캔디 (게임용)</p>
              </div>
            </div>

            {/* 캔디 부여 */}
            <div className="px-4 py-3 bg-pink-50 border-y">
              <p className="text-sm font-medium text-pink-700 mb-2">🍭 캔디 부여/차감</p>
              <div className="flex gap-2">
                <div className="flex-1 flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="px-3 text-red-600 hover:bg-red-50"
                    onClick={() => handleAddCookie(-5)}
                    disabled={isAddingCookie}
                  >
                    -5
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="px-3 text-red-600 hover:bg-red-50"
                    onClick={() => handleAddCookie(-1)}
                    disabled={isAddingCookie}
                  >
                    -1
                  </Button>
                  <Input
                    type="number"
                    value={cookieAmount}
                    onChange={(e) => setCookieAmount(e.target.value)}
                    placeholder="0"
                    className="w-20 text-center"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="px-3 text-green-600 hover:bg-green-50"
                    onClick={() => handleAddCookie(1)}
                    disabled={isAddingCookie}
                  >
                    +1
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="px-3 text-green-600 hover:bg-green-50"
                    onClick={() => handleAddCookie(5)}
                    disabled={isAddingCookie}
                  >
                    +5
                  </Button>
                </div>
                <Button
                  onClick={() => handleAddCookie()}
                  disabled={isAddingCookie || !cookieAmount}
                  className="bg-blue-500 hover:bg-blue-600"
                >
                  {isAddingCookie ? '...' : '적용'}
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-1">버튼 클릭: 즉시 적용 / 직접 입력 후 적용 버튼</p>
            </div>

            {/* 프로필 꾸미기 미리보기 */}
            <div className="px-4 py-4 bg-gradient-to-b from-purple-50 to-pink-50 border-b">
              <p className="text-sm font-medium text-purple-700 mb-3 text-center">🎨 프로필 미리보기</p>
              <div className="flex justify-center">
                <div
                  className="px-8 py-5 rounded-xl text-center shadow-lg"
                  style={{
                    border: `3px solid ${getBorderColor(selectedStudent.profile.buttonBorderCode)}`,
                    ...(isGradientFill(selectedStudent.profile.buttonFillCode)
                      ? { backgroundImage: getGradientStyle(selectedStudent.profile.buttonFillCode) }
                      : { backgroundColor: getFillColor(selectedStudent.profile.buttonFillCode) }
                    ),
                  }}
                >
                  <div className={`text-5xl mb-3 ${getAnimationClass(selectedStudent.profile.animationCode || 'none')}`}>
                    {selectedStudent.profilePhotoUrl && selectedStudent.profile.profilePhotoActive ? (
                      <img
                        src={selectedStudent.profilePhotoUrl}
                        alt={selectedStudent.name}
                        className="w-20 h-20 mx-auto rounded-full object-cover border-4 border-white shadow-lg"
                      />
                    ) : selectedStudent.profile.profileBadgeKey && selectedStudent.badges?.[selectedStudent.profile.profileBadgeKey]?.hasBadge ? (
                      <img
                        src={selectedStudent.badges[selectedStudent.profile.profileBadgeKey].imgUrl}
                        alt={selectedStudent.badges[selectedStudent.profile.profileBadgeKey].title}
                        className="w-16 h-16 mx-auto rounded"
                      />
                    ) : (
                      getEmojiFromCode(selectedStudent.profile.emojiCode) || '😀'
                    )}
                  </div>
                  {selectedStudent.profile.title && (
                    <div className="mb-2">
                      <span className={`inline-block text-sm px-3 py-1 rounded-full ${getTitleColorClass(selectedStudent.profile.titleColorCode)}`}>
                        {selectedStudent.profile.title}
                      </span>
                    </div>
                  )}
                  <p className={`font-bold text-xl ${getNameEffectClass(selectedStudent.profile.nameEffectCode)}`}>
                    {selectedStudent.name}
                  </p>
                </div>
              </div>
            </div>

            {/* GitHub 스타일 잔디 */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600 font-medium">🌱 최근 활동</span>
                <div className="flex items-center gap-1 text-[10px] text-gray-400">
                  <div className="w-2 h-2 rounded-sm bg-gray-200" title="0개" />
                  <div className="w-2 h-2 rounded-sm bg-green-300" title="1개" />
                  <div className="w-2 h-2 rounded-sm bg-green-500" title="2개" />
                  <div className="w-2 h-2 rounded-sm bg-green-700" title="3개+" />
                </div>
              </div>
              <div className="flex gap-[2px]">
                {getStudentLast14Days().map((day, index) => (
                  <div
                    key={index}
                    className={`w-4 h-4 rounded-sm ${getStudentGrassColor(day.count)}`}
                    title={`${day.date}: +${day.count}`}
                  />
                ))}
              </div>
            </div>

            {/* 뱃지 */}
            {selectedStudent.badges && (Object.values(selectedStudent.badges) as Badge[]).filter(b => b.hasBadge).length > 0 && (
              <div className="px-4 pb-4">
                <p className="text-sm text-gray-600 font-medium mb-2">🏆 획득 뱃지</p>
                <div className="flex gap-2 flex-wrap">
                  {(Object.entries(selectedStudent.badges) as [string, Badge][])
                    .filter(([, badge]) => badge.hasBadge)
                    .map(([key, badge]) => (
                      <img key={key} src={badge.imgUrl} alt={badge.title} title={badge.title} className="w-8 h-8 rounded" />
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 소원 선정 메시지 입력 모달 */}
      {grantingWish && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setGrantingWish(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-gray-800 mb-2">✨ 소원 선정하기</h3>
            <p className="text-sm text-gray-600 mb-4">
              <span className="font-medium">{grantingWish.studentName}</span>의 소원: "{grantingWish.content}"
            </p>
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                💬 전달할 메시지 (선택사항)
              </label>
              <input
                type="text"
                value={grantMessage}
                onChange={(e) => setGrantMessage(e.target.value)}
                placeholder="어디선가 들려오는 목소리로 전달됩니다..."
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setGrantingWish(null)}>
                취소
              </Button>
              <Button
                className="bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-500 hover:to-orange-500"
                onClick={async () => {
                  await handleGrantWish(grantingWish.id, grantMessage);
                  setGrantingWish(null);
                }}
              >
                ✨ 선정하기
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 프로필 확인 모달 */}
      {selectedProfileStudent && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedProfileStudent(null)}
        >
          <div
            className="bg-white shadow-2xl border-4 border-amber-300 overflow-hidden"
            style={{ width: '420px', maxWidth: '95vw', borderRadius: '24px' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="bg-gradient-to-r from-amber-400 to-orange-400 px-6 py-4 flex items-center justify-between">
              <span className="text-white font-bold text-lg">👤 학생 프로필</span>
              <button onClick={() => setSelectedProfileStudent(null)} className="text-white/80 hover:text-white text-2xl p-1">✕</button>
            </div>

            {/* 바디 */}
            <div className="p-6 space-y-5">
              {/* 중앙 프로필 카드 */}
              <div className={`text-center p-6 rounded-2xl ${getBackgroundClass(selectedProfileStudent.profile.backgroundCode) || 'bg-gradient-to-b from-amber-50 to-orange-50'}`}>
                <div
                  className={`inline-block p-4 rounded-2xl ${getAnimationClass(selectedProfileStudent.profile.animationCode || 'none')}`}
                  style={{
                    border: `2px solid ${getBorderColor(selectedProfileStudent.profile.buttonBorderCode)}`,
                    ...(isGradientFill(selectedProfileStudent.profile.buttonFillCode)
                      ? { backgroundImage: getGradientStyle(selectedProfileStudent.profile.buttonFillCode) }
                      : { backgroundColor: getFillColor(selectedProfileStudent.profile.buttonFillCode) }
                    ),
                  }}
                >
                  {/* 프로필 사진이 있으면 사진, 뱃지가 설정되어 있으면 뱃지, 없으면 이모지 표시 */}
                  {selectedProfileStudent.profilePhotoUrl && selectedProfileStudent.profile.profilePhotoActive ? (
                    <div className="mb-3">
                      <img
                        src={selectedProfileStudent.profilePhotoUrl}
                        alt={selectedProfileStudent.name}
                        className="w-24 h-24 mx-auto rounded-full object-cover border-4 border-white shadow-lg"
                      />
                    </div>
                  ) : selectedProfileStudent.profile.profileBadgeKey && selectedProfileStudent.badges?.[selectedProfileStudent.profile.profileBadgeKey]?.hasBadge ? (
                    <div className={`mb-3 ${getAnimationClass(selectedProfileStudent.profile.animationCode || 'none')}`}>
                      <img
                        src={selectedProfileStudent.badges[selectedProfileStudent.profile.profileBadgeKey].imgUrl}
                        alt={selectedProfileStudent.badges[selectedProfileStudent.profile.profileBadgeKey].title}
                        className="w-24 h-24 mx-auto rounded-lg"
                      />
                    </div>
                  ) : getEmojiFromCode(selectedProfileStudent.profile.emojiCode) ? (
                    <div className={`text-6xl mb-3 ${getAnimationClass(selectedProfileStudent.profile.animationCode || 'none')}`}>
                      {getEmojiFromCode(selectedProfileStudent.profile.emojiCode)}
                    </div>
                  ) : (
                    <div className="w-20 h-20 mx-auto mb-3 bg-gray-200 rounded-full flex items-center justify-center">
                      <span className="text-gray-400 text-3xl">👤</span>
                    </div>
                  )}
                  <p className={`font-bold text-xl ${getNameEffectClass(selectedProfileStudent.profile.nameEffectCode)}`}>
                    {selectedProfileStudent.name}
                  </p>
                  {selectedProfileStudent.profile.title && (
                    <p className={`text-sm mt-1 font-medium ${getTitleColorClass(selectedProfileStudent.profile.titleColorCode)}`}>
                      {selectedProfileStudent.profile.title}
                    </p>
                  )}
                </div>
              </div>

              {/* 통계 */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-amber-50 rounded-xl p-3">
                  <p className="font-bold text-2xl text-amber-600">{selectedProfileStudent.cookie}</p>
                  <p className="text-gray-500 text-sm">🍪 쿠키</p>
                </div>
                <div className="bg-green-50 rounded-xl p-3">
                  <p className="font-bold text-2xl text-green-600">{selectedProfileStudent.totalCookie}</p>
                  <p className="text-gray-500 text-sm">📊 누적</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-3">
                  <p className="font-bold text-2xl text-purple-600">{selectedProfileStudent.wishStreak || 0}</p>
                  <p className="text-gray-500 text-sm">🔥 연속</p>
                </div>
              </div>

              {/* 뱃지 */}
              {selectedProfileStudent.badges && Object.values(selectedProfileStudent.badges).some(b => b.hasBadge) && (
                <div className="p-3 bg-gray-50 rounded-xl">
                  <p className="text-sm text-gray-500 mb-2">🏆 획득 뱃지</p>
                  <div className="flex gap-2 flex-wrap">
                    {(Object.entries(selectedProfileStudent.badges) as [string, Badge][])
                      .filter(([, badge]) => badge.hasBadge)
                      .map(([key, badge]) => (
                        <img key={key} src={badge.imgUrl} alt={badge.title} className="w-8 h-8 rounded" title={badge.title} />
                      ))}
                  </div>
                </div>
              )}

              {/* 장착 아이템 */}
              <div className="p-3 bg-blue-50 rounded-xl">
                <p className="text-sm text-gray-500 mb-2">🎨 장착 아이템</p>
                <div className="flex flex-wrap gap-2">
                  {/* 이모지 */}
                  <span className="px-2 py-1 bg-white rounded-lg text-sm flex items-center gap-1">
                    <span className="text-lg">{getEmojiFromCode(selectedProfileStudent.profile.emojiCode) || '👤'}</span>
                    <span className="text-gray-600">이모지</span>
                  </span>
                  {/* 칭호 */}
                  {selectedProfileStudent.profile.title && (
                    <span className={`px-2 py-1 bg-white rounded-lg text-sm flex items-center gap-1 ${getTitleColorClass(selectedProfileStudent.profile.titleColorCode)}`}>
                      <span>🏷️</span>
                      <span>{selectedProfileStudent.profile.title}</span>
                    </span>
                  )}
                  {/* 버튼 테두리 */}
                  {selectedProfileStudent.profile.buttonBorderCode && selectedProfileStudent.profile.buttonBorderCode !== 'gray-300' && (
                    <span
                      className="px-2 py-1 bg-white rounded-lg text-sm flex items-center gap-1"
                      style={{ border: `2px solid ${getBorderColor(selectedProfileStudent.profile.buttonBorderCode)}` }}
                    >
                      <span>🖼️</span>
                      <span className="text-gray-600">테두리</span>
                    </span>
                  )}
                  {/* 버튼 색상 */}
                  {selectedProfileStudent.profile.buttonFillCode && selectedProfileStudent.profile.buttonFillCode !== 'none' && (
                    <span
                      className="px-2 py-1 rounded-lg text-sm flex items-center gap-1"
                      style={{
                        ...(isGradientFill(selectedProfileStudent.profile.buttonFillCode)
                          ? { backgroundImage: getGradientStyle(selectedProfileStudent.profile.buttonFillCode) }
                          : { backgroundColor: getFillColor(selectedProfileStudent.profile.buttonFillCode) }
                        ),
                      }}
                    >
                      <span>🎨</span>
                      <span>버튼색</span>
                    </span>
                  )}
                  {/* 애니메이션 */}
                  {selectedProfileStudent.profile.animationCode && selectedProfileStudent.profile.animationCode !== 'none' && (
                    <span className={`px-2 py-1 bg-white rounded-lg text-sm flex items-center gap-1 ${getAnimationClass(selectedProfileStudent.profile.animationCode)}`}>
                      <span>✨</span>
                      <span className="text-gray-600">애니메이션</span>
                    </span>
                  )}
                  {/* 이름 효과 */}
                  {selectedProfileStudent.profile.nameEffectCode && selectedProfileStudent.profile.nameEffectCode !== 'none' && (
                    <span className="px-2 py-1 bg-white rounded-lg text-sm flex items-center gap-1">
                      <span>💫</span>
                      <span className={getNameEffectClass(selectedProfileStudent.profile.nameEffectCode)}>이름효과</span>
                    </span>
                  )}
                </div>
              </div>

              {/* 잔디 */}
              <div className="p-3 bg-green-50 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">🌱 최근 활동</span>
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <span>적음</span>
                    <div className="w-3 h-3 rounded-sm bg-gray-200" />
                    <div className="w-3 h-3 rounded-sm bg-green-300" />
                    <div className="w-3 h-3 rounded-sm bg-green-500" />
                    <span>많음</span>
                  </div>
                </div>
                {isLoadingProfileGrass ? (
                  <p className="text-center text-sm text-gray-400 py-4">로딩 중...</p>
                ) : (
                  <div className="flex gap-[2px] justify-center">
                    {(() => {
                      const WEEKS = 12;
                      const today = new Date();
                      const todayDayOfWeek = today.getDay();

                      // endDate: 오늘이 주중이면 오늘, 주말이면 지난주 금요일
                      let endDate = new Date(today);
                      if (todayDayOfWeek === 0) {
                        endDate.setDate(endDate.getDate() - 2);
                      } else if (todayDayOfWeek === 6) {
                        endDate.setDate(endDate.getDate() - 1);
                      }

                      // endDate가 속한 주의 월요일부터 시작
                      const startDate = new Date(endDate);
                      const endDateDayOfWeek = endDate.getDay();
                      const daysFromMonday = endDateDayOfWeek === 0 ? 6 : endDateDayOfWeek - 1;
                      startDate.setDate(startDate.getDate() - daysFromMonday);
                      startDate.setDate(startDate.getDate() - (WEEKS - 1) * 7);

                      return Array.from({ length: WEEKS }).map((_, weekIndex) => (
                        <div key={weekIndex} className="flex flex-col gap-[2px]">
                          {Array.from({ length: 5 }).map((_, dayIndex) => {
                            const date = new Date(startDate);
                            date.setDate(date.getDate() + weekIndex * 7 + dayIndex);
                            const dateStr = getKoreanDateString(date);

                            // 날짜만 비교 (시간 제외)
                            const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                            const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
                            const isFuture = dateOnly > endDateOnly;

                            // 미래 날짜는 렌더링하지 않음
                            if (isFuture) {
                              return null;
                            }

                            const grassRecord = profileStudentGrass.find((g) => g.date === dateStr);
                            const cookieChange = grassRecord?.cookieChange || 0;
                            return (
                              <div
                                key={dayIndex}
                                className={`w-3 h-3 rounded-sm ${getGrassColor(cookieChange)}`}
                                title={`${dateStr}: +${cookieChange}쿠키`}
                              />
                            );
                          })}
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 팀원 선택 모달 */}
      {showTeamMemberModal && teamForMemberModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowTeamMemberModal(false);
            setTeamForMemberModal(null);
            setMembersToAdd([]);
            setMembersToRemove([]);
          }}
        >
          <div
            data-tutorial="team-member-modal"
            className="bg-white shadow-2xl border-2 border-green-300 overflow-hidden flex flex-col"
            style={{ width: '380px', maxWidth: '95vw', maxHeight: '70vh', borderRadius: '16px' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="bg-gradient-to-r from-green-400 to-green-500 px-4 py-3 flex items-center justify-between">
              <span className="text-white font-bold">👥 팀 관리</span>
              <button
                onClick={() => {
                  setShowTeamMemberModal(false);
                  setTeamForMemberModal(null);
                  setMembersToAdd([]);
                  setMembersToRemove([]);
                  setEditingTeamName('');
                  setEditingTeamFlag('');
                }}
                className="text-white/80 hover:text-white text-xl"
              >
                ✕
              </button>
            </div>

            {/* 바디 */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* 팀 이름/이모지 수정 */}
              <div className="p-2 bg-blue-50 rounded-lg">
                <p className="text-xs font-medium text-blue-600 mb-2">✏️ 팀 정보 수정</p>
                <div className="flex gap-2">
                  <select
                    value={editingTeamFlag}
                    onChange={(e) => setEditingTeamFlag(e.target.value)}
                    className="px-2 py-1 border rounded text-xl w-14"
                  >
                    {TEAM_FLAGS.slice(0, 20).map((flag) => (
                      <option key={flag} value={flag}>{flag}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={editingTeamName}
                    onChange={(e) => setEditingTeamName(e.target.value)}
                    className="flex-1 px-2 py-1 border rounded text-sm"
                    placeholder="팀 이름"
                  />
                </div>
              </div>

              {/* 현재 팀원 */}
              {(() => {
                const currentTeam = teams.find(t => t.teamId === teamForMemberModal);
                const currentMembers = currentTeam?.members || [];
                if (currentMembers.length === 0) return null;

                return (
                  <div className="p-2 bg-red-50 rounded-lg">
                    <p className="text-xs font-medium text-red-600 mb-2">🗑️ 현재 팀원 (클릭하여 제거)</p>
                    <div className="flex flex-wrap gap-1">
                      {currentMembers.map(code => {
                        const student = displayStudents.find(s => s.code === code);
                        const isMarkedForRemove = membersToRemove.includes(code);
                        return (
                          <button
                            key={code}
                            onClick={() => {
                              if (isMarkedForRemove) {
                                setMembersToRemove(prev => prev.filter(c => c !== code));
                              } else {
                                setMembersToRemove(prev => [...prev, code]);
                              }
                            }}
                            className={`px-2 py-1 rounded text-xs flex items-center gap-1 transition-all ${
                              isMarkedForRemove
                                ? 'bg-red-500 text-white line-through'
                                : 'bg-white border border-red-200 hover:bg-red-100'
                            }`}
                          >
                            <span>{getEmojiFromCode(student?.profile.emojiCode || '') || '👤'}</span>
                            <span>{student?.name || code}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* 추가할 학생 선택 */}
              <div className="p-2 bg-green-50 rounded-lg">
                <p className="text-xs font-medium text-green-600 mb-2">➕ 학생 선택 (클릭하여 추가)</p>
                <div className="flex flex-wrap gap-1 max-h-[200px] overflow-y-auto">
                  {displayStudents.map((student) => {
                    const currentTeam = displayTeams.find(t => t.teamId === teamForMemberModal);
                    const isInCurrentTeam = currentTeam?.members.includes(student.code);
                    const otherTeam = displayTeams.find(t => t.teamId !== teamForMemberModal && t.members.includes(student.code));
                    const isInOtherTeam = !!otherTeam;
                    const isMarkedForAdd = membersToAdd.includes(student.code);

                    // 현재 팀에 있으면 표시 안함
                    if (isInCurrentTeam) return null;

                    return (
                      <button
                        key={student.code}
                        onClick={() => {
                          if (isMarkedForAdd) {
                            setMembersToAdd(prev => prev.filter(c => c !== student.code));
                          } else {
                            setMembersToAdd(prev => [...prev, student.code]);
                          }
                        }}
                        className={`px-2 py-1 rounded text-xs flex items-center gap-1 transition-all ${
                          isMarkedForAdd
                            ? isInOtherTeam
                              ? 'bg-orange-500 text-white'
                              : 'bg-green-500 text-white'
                            : isInOtherTeam
                            ? 'bg-orange-100 border border-orange-300 hover:bg-orange-200 text-orange-700'
                            : 'bg-white border border-green-200 hover:bg-green-100'
                        }`}
                        title={isInOtherTeam ? `${otherTeam?.flag} ${otherTeam?.teamName}에서 이동` : ''}
                      >
                        <span>{getEmojiFromCode(student.profile.emojiCode) || '👤'}</span>
                        <span>{student.name}</span>
                        {isInOtherTeam && <span className="text-[10px]">({otherTeam?.flag}→)</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 푸터 - 적용 버튼 */}
            {(() => {
              const currentTeam = teams.find(t => t.teamId === teamForMemberModal);
              const hasNameChange = editingTeamName !== currentTeam?.teamName;
              const hasFlagChange = editingTeamFlag !== currentTeam?.flag;
              const hasChanges = membersToAdd.length > 0 || membersToRemove.length > 0 || hasNameChange || hasFlagChange;

              if (!hasChanges) return null;

              return (
                <div className="p-3 border-t bg-gray-50 flex items-center justify-between">
                  <div className="text-xs text-gray-500 space-x-1">
                    {(hasNameChange || hasFlagChange) && <span className="text-blue-600">팀정보 수정</span>}
                    {membersToAdd.length > 0 && <span className="text-green-600">+{membersToAdd.length}명</span>}
                    {membersToRemove.length > 0 && <span className="text-red-600">-{membersToRemove.length}명</span>}
                  </div>
                  <Button
                    size="sm"
                    onClick={async () => {
                      if (!user || !selectedClass || !teamForMemberModal) return;
                      // 팀 이름/이모지 수정
                      if (hasNameChange || hasFlagChange) {
                        await updateTeam(user.uid, selectedClass, teamForMemberModal, {
                          teamName: editingTeamName,
                          flag: editingTeamFlag
                        });
                      }
                      // 멤버 제거
                      for (const code of membersToRemove) {
                        await removeTeamMember(user.uid, selectedClass, teamForMemberModal, code);
                      }
                      // 멤버 추가 (다른 팀에 있는 경우 먼저 제거)
                      for (const code of membersToAdd) {
                        const otherTeam = teams.find(t => t.teamId !== teamForMemberModal && t.members.includes(code));
                        if (otherTeam) {
                          await removeTeamMember(user.uid, selectedClass, otherTeam.teamId, code);
                        }
                        await addTeamMember(user.uid, selectedClass, teamForMemberModal, code);
                      }
                      await loadTeams();
                      toast.success('팀이 수정되었습니다!');
                      setShowTeamMemberModal(false);
                      setTeamForMemberModal(null);
                      setMembersToAdd([]);
                      setMembersToRemove([]);
                      setEditingTeamName('');
                      setEditingTeamFlag('');
                    }}
                    className="bg-green-500 hover:bg-green-600"
                  >
                    적용하기
                  </Button>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* 쿠키 상점 신청 처리 모달 */}
      {showCookieRequestModal && selectedCookieRequest && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowCookieRequestModal(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-4">📋 신청 처리</h3>

            <div className="space-y-3 mb-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium">{selectedCookieRequest.studentName} ({selectedCookieRequest.studentNumber}번)</p>
                <p className="text-sm text-gray-600">{selectedCookieRequest.itemName} x{selectedCookieRequest.quantity}</p>
                <p className="text-sm text-amber-600 font-medium">총 {selectedCookieRequest.totalPrice} 쿠키 차감</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-600 block mb-1">답변 메시지 (선택)</label>
                <Input
                  placeholder="학생에게 전달할 메시지를 입력하세요"
                  value={teacherResponse}
                  onChange={(e) => setTeacherResponse(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => handleCookieRequestResponse('approved')}
                className="flex-1 bg-green-500 hover:bg-green-600"
              >
                ✅ 승인
              </Button>
              <Button
                onClick={() => handleCookieRequestResponse('rejected')}
                variant="outline"
                className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
              >
                ❌ 거절
              </Button>
              <Button
                onClick={() => {
                  setShowCookieRequestModal(false);
                  setSelectedCookieRequest(null);
                  setTeacherResponse('');
                }}
                variant="outline"
              >
                취소
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 물품 요청 모달 */}
      {showItemSuggestionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-xl flex flex-col">
            <div className="p-4 bg-amber-50 border-b border-amber-200 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold text-amber-800">💡 학생 물품 요청</h3>
                <p className="text-sm text-amber-600 mt-1">학생들이 상점에 추가됐으면 하는 물품 요청 목록입니다.</p>
              </div>
              <button
                onClick={() => setShowItemSuggestionsModal(false)}
                className="p-2 text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {selectedItemSuggestion ? (
                // 선택된 요청 처리 화면
                <div className="space-y-4">
                  <button
                    onClick={() => {
                      setSelectedItemSuggestion(null);
                      setSuggestionResponseMessage('');
                    }}
                    className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                  >
                    ← 목록으로
                  </button>
                  <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                    <h4 className="font-bold text-lg mb-2">{selectedItemSuggestion.itemName}</h4>
                    {selectedItemSuggestion.description && (
                      <p className="text-sm text-gray-600 mb-2">{selectedItemSuggestion.description}</p>
                    )}
                    <p className="text-xs text-gray-500">
                      요청자: {selectedItemSuggestion.studentName} · {selectedItemSuggestion.createdAt?.toDate?.()?.toLocaleDateString('ko-KR') || ''}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">학생에게 보낼 메시지</label>
                    <textarea
                      value={suggestionResponseMessage}
                      onChange={(e) => setSuggestionResponseMessage(e.target.value)}
                      placeholder="예: 다음 달에 추가할게요! / 가격이 너무 비싸서 어려워요"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none"
                      rows={3}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSuggestionResponse(selectedItemSuggestion, 'approved', suggestionResponseMessage)}
                      className="flex-1 py-2 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600"
                    >
                      ✅ 승인
                    </button>
                    <button
                      onClick={() => handleSuggestionResponse(selectedItemSuggestion, 'rejected', suggestionResponseMessage)}
                      className="flex-1 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600"
                    >
                      ❌ 거절
                    </button>
                  </div>
                </div>
              ) : itemSuggestions.length === 0 ? (
                <p className="text-center py-12 text-gray-500">물품 요청이 없습니다.</p>
              ) : (
                <div className="space-y-3">
                  {itemSuggestions.map((suggestion) => (
                    <div
                      key={suggestion.id}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md ${
                        suggestion.status === 'pending'
                          ? 'border-amber-300 bg-amber-50'
                          : suggestion.status === 'approved'
                          ? 'border-green-300 bg-green-50'
                          : 'border-red-300 bg-red-50'
                      }`}
                      onClick={() => suggestion.status === 'pending' && setSelectedItemSuggestion(suggestion)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-lg">{suggestion.itemName}</span>
                            <span className={`px-2 py-0.5 text-xs rounded-full ${
                              suggestion.status === 'pending' ? 'bg-amber-200 text-amber-800' :
                              suggestion.status === 'approved' ? 'bg-green-200 text-green-800' :
                              'bg-red-200 text-red-800'
                            }`}>
                              {suggestion.status === 'pending' ? '대기중' :
                               suggestion.status === 'approved' ? '승인됨' : '거절됨'}
                            </span>
                          </div>
                          {suggestion.description && (
                            <p className="text-sm text-gray-600 mb-2">{suggestion.description}</p>
                          )}
                          <p className="text-xs text-gray-400">
                            요청자: {suggestion.studentName} · {suggestion.createdAt?.toDate?.()?.toLocaleDateString('ko-KR') || ''}
                          </p>
                          {suggestion.teacherMessage && (
                            <p className="mt-2 text-sm text-gray-700 bg-white p-2 rounded">
                              💬 내 답변: {suggestion.teacherMessage}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSuggestion(suggestion.id);
                          }}
                          className="px-2 py-1 text-gray-400 hover:text-red-500"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 bg-gray-50 border-t shrink-0">
              <Button
                onClick={() => {
                  setShowItemSuggestionsModal(false);
                  setSelectedItemSuggestion(null);
                  setSuggestionResponseMessage('');
                }}
                className="w-full"
                variant="outline"
              >
                닫기
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 워드클라우드 모달 */}
      {showWordCloudModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowWordCloudModal(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border-4 border-blue-300 max-h-[90vh] overflow-y-auto"
            style={{ width: '800px', maxWidth: '95vw' }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="bg-gradient-to-r from-blue-400 to-cyan-400 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <span className="text-3xl">☁️</span>
                <h2 className="text-xl font-bold text-white">워드클라우드</h2>
              </div>
              <button
                onClick={() => setShowWordCloudModal(false)}
                className="text-white/80 hover:text-white text-2xl p-1 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* 내용 */}
            <div className="p-6">
              {selectedClass ? (
                <TeacherWordCloud
                  teacherId={user?.uid || ''}
                  classId={selectedClass}
                />
              ) : (
                <div className="text-center py-8 text-gray-500">
                  학급을 먼저 선택해주세요
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 학급 그룹 이름 모달 */}
      {showGroupModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowGroupModal(false);
            setGroupName('');
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-4">🔗 그룹 이름 지정</h3>
            <p className="text-sm text-gray-500 mb-4">
              선택한 {selectedForGroup.length}개 학급의 소원을 공유합니다.
            </p>
            <div className="mb-4">
              <Input
                placeholder="그룹 이름 (예: 5학년)"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleCreateGroup}
                className="flex-1 bg-purple-500 hover:bg-purple-600"
                disabled={!groupName.trim()}
              >
                그룹 만들기
              </Button>
              <Button
                onClick={() => {
                  setShowGroupModal(false);
                  setGroupName('');
                }}
                variant="outline"
                className="flex-1"
              >
                취소
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* To개발자 모달 */}
      <FeedbackModal
        isOpen={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        userType="teacher"
        userName={teacher?.name}
        userCode={user?.uid}
      />

      {/* 잔디밭 모달 */}
      <GrassFieldModal
        isOpen={showGrassFieldModal}
        onClose={() => setShowGrassFieldModal(false)}
        classesData={grassFieldData}
      />

      {/* 쿠키배틀 도움말 모달 */}
      {showCookieBattleHelp && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-stone-800 rounded-2xl max-w-md w-full max-h-[85dvh] overflow-hidden border border-amber-600/30">
            {/* 헤더 */}
            <div className="p-4 border-b border-stone-700 flex items-center justify-between">
              <h2 className="text-xl font-bold text-amber-400">📖 쿠키배틀 게임 방법</h2>
              <button
                onClick={() => { setShowCookieBattleHelp(false); setCookieBattleHelpPage(0); }}
                className="text-stone-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            {/* 페이지 인디케이터 */}
            <div className="flex justify-center gap-2 py-3 bg-stone-900/50">
              {[0, 1, 2, 3].map(i => (
                <button
                  key={i}
                  onClick={() => setCookieBattleHelpPage(i)}
                  className={`w-3 h-3 rounded-full transition-all ${
                    cookieBattleHelpPage === i ? 'bg-amber-400 scale-125' : 'bg-stone-600 hover:bg-stone-500'
                  }`}
                />
              ))}
            </div>

            {/* 컨텐츠 */}
            <div className="p-6 overflow-y-auto max-h-[50dvh]">
              {/* 페이지 1: 게임 소개 */}
              {cookieBattleHelpPage === 0 && (
                <div className="space-y-4 text-stone-300">
                  <div className="text-center mb-6">
                    <span className="text-5xl">🏰</span>
                    <h3 className="text-2xl font-bold text-amber-400 mt-2">쿠키 배틀</h3>
                    <p className="text-stone-400 mt-1">팀 대전 전략 게임</p>
                  </div>
                  <div className="bg-stone-700/50 rounded-xl p-4">
                    <h3 className="font-bold text-amber-400 mb-2">🎯 게임 목표</h3>
                    <p className="text-sm">
                      팀의 쿠키를 지키면서 다른 팀의 쿠키를 빼앗으세요!<br/>
                      쿠키가 0이 되면 탈락, 마지막까지 살아남은 팀이 승리합니다.
                    </p>
                  </div>
                  <div className="bg-stone-700/50 rounded-xl p-4">
                    <h3 className="font-bold text-amber-400 mb-2">👑 대표자 역할</h3>
                    <p className="text-sm">
                      각 팀의 대표자가 배팅과 공격 대상을 결정합니다.<br/>
                      팀원은 대표자의 선택을 지켜볼 수 있습니다.
                    </p>
                  </div>
                  <div className="bg-stone-700/50 rounded-xl p-4">
                    <h3 className="font-bold text-amber-400 mb-2">🔄 게임 흐름</h3>
                    <div className="text-sm space-y-1">
                      <p>1️⃣ <span className="text-blue-400">배팅 단계</span> - 공격/수비 쿠키 배분</p>
                      <p>2️⃣ <span className="text-purple-400">대상 선택</span> - 공격할 팀 선택</p>
                      <p>3️⃣ <span className="text-red-400">전투</span> - 자동 계산</p>
                      <p>4️⃣ <span className="text-green-400">결과</span> - 승패 확인</p>
                    </div>
                  </div>
                </div>
              )}

              {/* 페이지 2: 배팅 시스템 */}
              {cookieBattleHelpPage === 1 && (
                <div className="space-y-4 text-stone-300">
                  <div className="text-center mb-4">
                    <span className="text-4xl">💰</span>
                    <h3 className="text-xl font-bold text-amber-400 mt-2">배팅 시스템</h3>
                  </div>
                  <div className="bg-red-900/30 rounded-xl p-4 border border-red-600/30">
                    <h3 className="font-bold text-red-400 mb-2">⚔️ 공격 배팅</h3>
                    <p className="text-sm">
                      다른 팀을 공격할 때 사용합니다.<br/>
                      <span className="text-amber-300">공격 &gt; 수비</span>일 때 공격이 성공합니다!
                    </p>
                  </div>
                  <div className="bg-blue-900/30 rounded-xl p-4 border border-blue-600/30">
                    <h3 className="font-bold text-blue-400 mb-2">🛡️ 수비 배팅</h3>
                    <p className="text-sm">
                      다른 팀의 공격을 방어할 때 사용합니다.<br/>
                      <span className="text-amber-300">수비 ≥ 공격</span>일 때 방어가 성공합니다!
                    </p>
                  </div>
                  <div className="bg-stone-700/50 rounded-xl p-4">
                    <h3 className="font-bold text-green-400 mb-2">💡 배팅 규칙</h3>
                    <ul className="text-sm space-y-1">
                      <li>• 공격 + 수비 합계 ≤ 보유 쿠키</li>
                      <li>• 공격 0 = 수비에만 집중</li>
                      <li>• 수비 0 = 공격에 올인 (위험!)</li>
                      <li>• 배팅 후에는 변경 불가!</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* 페이지 3: 점수 계산 */}
              {cookieBattleHelpPage === 2 && (
                <div className="space-y-4 text-stone-300">
                  <div className="text-center mb-4">
                    <span className="text-4xl">📊</span>
                    <h3 className="text-xl font-bold text-amber-400 mt-2">점수 계산</h3>
                  </div>
                  <div className="bg-red-900/30 rounded-xl p-4 border border-red-600/30">
                    <h3 className="font-bold text-red-400 mb-2">⚔️ 공격 승리 (공격 &gt; 수비)</h3>
                    <div className="text-sm space-y-1">
                      <p><span className="text-red-300">공격팀:</span> +(공격-수비) 차이만큼 획득</p>
                      <p><span className="text-blue-300">방어팀:</span> +50% 환불 - 차이만큼 손실</p>
                    </div>
                    <div className="mt-2 p-2 bg-black/30 rounded text-xs">
                      예) 공격 30, 수비 20 → 공격팀 +10, 방어팀 -20
                    </div>
                  </div>
                  <div className="bg-blue-900/30 rounded-xl p-4 border border-blue-600/30">
                    <h3 className="font-bold text-blue-400 mb-2">🛡️ 방어 승리 (공격 &lt; 수비)</h3>
                    <div className="text-sm space-y-1">
                      <p><span className="text-red-300">공격팀:</span> -배팅 전액 손실</p>
                      <p><span className="text-blue-300">방어팀:</span> +10 보너스!</p>
                    </div>
                    <div className="mt-2 p-2 bg-black/30 rounded text-xs">
                      예) 공격 20, 수비 30 → 공격팀 -20, 방어팀 +10
                    </div>
                  </div>
                  <div className="bg-stone-700/50 rounded-xl p-4">
                    <h3 className="font-bold text-stone-400 mb-2">⚖️ 동점 / 공격 안 받음</h3>
                    <div className="text-sm space-y-1">
                      <p>• 동점: 양팀 모두 배팅의 30% 손실</p>
                      <p>• 공격 안 받음: 수비 배팅의 80% 환불</p>
                    </div>
                  </div>
                </div>
              )}

              {/* 페이지 4: 전략 팁 */}
              {cookieBattleHelpPage === 3 && (
                <div className="space-y-4 text-stone-300">
                  <div className="text-center mb-4">
                    <span className="text-4xl">💡</span>
                    <h3 className="text-xl font-bold text-amber-400 mt-2">전략 팁</h3>
                  </div>
                  <div className="bg-stone-700/50 rounded-xl p-4">
                    <h3 className="font-bold text-green-400 mb-2">✅ 좋은 전략</h3>
                    <ul className="text-sm space-y-2">
                      <li>• 상대 팀의 쿠키 수를 파악하세요</li>
                      <li>• 수비를 확실히 해두면 공격 실패 시 보너스!</li>
                      <li>• 공격 안 받으면 80% 환불받아요</li>
                      <li>• 동점은 양팀 손해! 차이를 만드세요</li>
                    </ul>
                  </div>
                  <div className="bg-red-900/30 rounded-xl p-4 border border-red-600/30">
                    <h3 className="font-bold text-red-400 mb-2">❌ 주의사항</h3>
                    <ul className="text-sm space-y-2">
                      <li>• 수비 없이 올인 공격은 위험해요!</li>
                      <li>• 동점 노리기보다 확실한 승패를!</li>
                      <li>• 쿠키 0이 되면 바로 탈락!</li>
                    </ul>
                  </div>
                  <div className="bg-amber-900/30 rounded-xl p-4 border border-amber-600/30">
                    <h3 className="font-bold text-amber-400 mb-2">🏆 승리 조건</h3>
                    <p className="text-sm">
                      마지막까지 살아남은 팀이 승리!<br/>
                      쿠키를 잘 지키면서 상대를 공격하세요!
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* 하단 버튼 */}
            <div className="p-4 border-t border-stone-700 flex gap-2">
              <button
                onClick={() => { setShowCookieBattleHelp(false); setCookieBattleHelpPage(0); }}
                className="py-3 px-4 bg-stone-600 text-white font-bold rounded-xl hover:bg-stone-500 transition-colors"
              >
                닫기
              </button>
              <button
                onClick={() => setCookieBattleHelpPage(Math.max(0, cookieBattleHelpPage - 1))}
                disabled={cookieBattleHelpPage === 0}
                className="flex-1 py-3 bg-stone-700 text-white font-bold rounded-xl hover:bg-stone-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ← 이전
              </button>
              {cookieBattleHelpPage < 3 ? (
                <button
                  onClick={() => setCookieBattleHelpPage(cookieBattleHelpPage + 1)}
                  className="flex-1 py-3 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 transition-colors"
                >
                  다음 →
                </button>
              ) : (
                <button
                  onClick={() => { setShowCookieBattleHelp(false); setCookieBattleHelpPage(0); }}
                  className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-colors"
                >
                  ✓ 이해했어요!
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tutorial Joyride */}
      <Joyride
        steps={teacherTutorialSteps}
        run={runTutorial}
        stepIndex={stepIndex}
        continuous
        showSkipButton
        disableOverlayClose
        spotlightClicks
        disableScrollParentFix
        callback={handleJoyrideCallback}
        tooltipComponent={CustomTooltip}
        floaterProps={{
          disableAnimation: true,
        }}
        styles={{
          options: {
            primaryColor: '#3b82f6',
            zIndex: 10000,
          },
          overlay: {
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
          },
        }}
      />
    </div>
  );
}