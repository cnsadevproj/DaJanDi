import React, { useState, useEffect } from 'react';
import { PageLayout } from '../components/PageLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import {
  ShoppingBag,
  Candy,
  Check,
  Lock,
  Sparkles,
  Palette,
  Type,
  Square,
  Image,
  Tag,
} from 'lucide-react';
import {
  getTeacherShopItems,
  getStudent,
  purchaseItem,
  ShopItem,
  Student,
} from '../services/firestoreApi';
import {
  ItemCategory,
  ALL_SHOP_ITEMS,
  getItemByCode,
} from '../types/shop';

interface ShopProps {
  onBack?: () => void;
}

// 카테고리 정보
const CATEGORIES: { key: ItemCategory; label: string; icon: React.ReactNode }[] = [
  { key: 'emoji', label: '이모지', icon: <Sparkles className="w-4 h-4" /> },
  { key: 'custom', label: '커스텀', icon: <Tag className="w-4 h-4" /> },
  { key: 'titleColor', label: '칭호색상', icon: <Palette className="w-4 h-4" /> },
  { key: 'animation', label: '애니메이션', icon: <Sparkles className="w-4 h-4" /> },
  { key: 'buttonBorder', label: '테두리색', icon: <Square className="w-4 h-4" /> },
  { key: 'buttonFill', label: '채우기', icon: <Palette className="w-4 h-4" /> },
  { key: 'border', label: '프로필테두리', icon: <Square className="w-4 h-4" /> },
  { key: 'nameEffect', label: '이름효과', icon: <Type className="w-4 h-4" /> },
  { key: 'background', label: '배경', icon: <Image className="w-4 h-4" /> },
];

export function Shop({ onBack }: ShopProps) {
  const { student: authStudent, studentTeacherId, role } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<ItemCategory>('emoji');
  const [student, setStudent] = useState<Student | null>(null);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isTeacher = role === 'teacher';

  // 카테고리 정규화 (이전 카테고리를 새 카테고리로 매핑)
  const normalizeCategory = (category: string): string => {
    if (category === 'titlePermit' || category === 'profilePhoto') {
      return 'custom';
    }
    return category;
  };

  // 스트릭 프리즈 아이템 식별 (제거된 기능, 잔존 데이터 숨김용)
  const isStreakFreezeItem = (item: ShopItem): boolean => {
    return /streak|freeze/i.test(item.code) || /스트릭|프리즈/.test(item.name);
  };

  // 데이터 로드
  useEffect(() => {
    const loadData = async () => {
      // 로그인 정보가 없으면 기본 상품만 표시
      if (!authStudent?.code || !studentTeacherId) {
        setShopItems(ALL_SHOP_ITEMS);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const [studentData, items] = await Promise.all([
          getStudent(studentTeacherId, authStudent.code),
          getTeacherShopItems(studentTeacherId),
        ]);

        setStudent(studentData);
        // Firebase에 상품이 없으면 기본 상품 목록 사용
        if (items.length > 0) {
          const normalizedItems = items
            .filter(item => !isStreakFreezeItem(item))
            .map(item => ({
              ...item,
              category: normalizeCategory(item.category) as typeof item.category
            }));
          setShopItems(normalizedItems);
        } else {
          setShopItems(ALL_SHOP_ITEMS);
        }
      } catch (error) {
        console.error('데이터 로드 오류:', error);
        // 에러 시에도 기본 상품 표시
        setShopItems(ALL_SHOP_ITEMS);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [authStudent?.code, studentTeacherId]);

  // 카테고리별 아이템 필터링
  const categoryItems = shopItems.filter(item => item.category === selectedCategory);

  // 아이템 구매
  const handlePurchase = async (itemCode: string) => {
    if (!authStudent?.code || !studentTeacherId || !student) return;

    const item = shopItems.find(i => i.code === itemCode);
    if (!item) return;

    setPurchasing(itemCode);
    setMessage(null);

    try {
      await purchaseItem(studentTeacherId, authStudent.code, itemCode, item.price);
      setMessage({ type: 'success', text: '구매 완료!' });
      // 학생 정보 다시 로드
      const updatedStudent = await getStudent(studentTeacherId, authStudent.code);
      setStudent(updatedStudent);
    } catch (error) {
      setMessage({ type: 'error', text: '오류가 발생했습니다.' });
    } finally {
      setPurchasing(null);
      // 메시지 자동 숨김
      setTimeout(() => setMessage(null), 3000);
    }
  };

  // 아이템 상태 확인
  const getItemStatus = (item: ShopItem) => {
    if (!student) return { owned: false, canBuy: false };

    const owned = student.ownedItems.includes(item.code);
    const canBuy = !owned && (student.jelly ?? 0) >= item.price;

    return { owned, canBuy };
  };

  // 사용 가능한 캔디 (상점/게임 재화)
  const availableJelly = student?.jelly ?? 0;

  if (isTeacher) {
    return (
      <PageLayout title="상점" role="admin" showBack onBack={onBack}>
        <Card>
          <CardContent className="pt-6 text-center">
            <Palette className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500">상점은 학생 전용입니다.</p>
          </CardContent>
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="상점" role="student" showBack onBack={onBack}>
      <div className="space-y-4">
        {/* 캔디 정보 */}
        <Card className="bg-gradient-to-r from-pink-500 to-rose-500 text-white">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <Candy className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm text-pink-100">사용 가능한 캔디</p>
                <p className="text-2xl font-bold">{availableJelly} 🍭</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 메시지 */}
        {message && (
          <div
            className={`p-3 rounded-lg text-center font-medium ${
              message.type === 'success'
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* 카테고리 탭 */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => setSelectedCategory(cat.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
                selectedCategory === cat.key
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat.icon}
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        {/* 아이템 목록 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5" />
              {CATEGORIES.find(c => c.key === selectedCategory)?.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-500">
                로딩 중...
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {categoryItems.map(item => {
                  const { owned, canBuy } = getItemStatus(item);
                  const localItem = getItemByCode(item.code);
                  const displayValue = localItem?.value || item.value;

                  return (
                    <div
                      key={item.code}
                      className={`relative p-2 rounded-lg border-2 transition-all ${
                        owned
                          ? 'border-green-300 bg-green-50'
                          : canBuy
                          ? 'border-purple-200 bg-white hover:border-purple-400 hover:shadow-md'
                          : 'border-gray-200 bg-gray-50 opacity-75'
                      }`}
                    >
                      {/* 보유 중 배지 */}
                      {owned && (
                        <Badge className="absolute -top-2 -right-2 bg-green-500">
                          <Check className="w-3 h-3 mr-1" />
                          보유중
                        </Badge>
                      )}

                      {/* 카테고리 유형 표시 (상단) */}
                      <div className="text-center text-[10px] text-gray-400 mb-1">
                        {selectedCategory === 'emoji' && '이모지'}
                        {selectedCategory === 'custom' && '커스텀'}
                        {selectedCategory === 'titleColor' && '칭호색상'}
                        {selectedCategory === 'animation' && '애니메이션'}
                        {selectedCategory === 'buttonBorder' && '테두리색'}
                        {selectedCategory === 'buttonFill' && '채우기'}
                        {selectedCategory === 'border' && '프로필테두리'}
                        {selectedCategory === 'nameEffect' && '이름효과'}
                        {selectedCategory === 'background' && '배경'}
                      </div>

                      {/* 아이템 미리보기 (중앙 - 크게) */}
                      <div className="text-center mb-1">
                        {selectedCategory === 'emoji' && (
                          <span className="text-3xl">{displayValue}</span>
                        )}
                        {selectedCategory === 'custom' && (
                          <span className="text-3xl">
                            {item.name.match(/(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u)?.[0] || '⚙️'}
                          </span>
                        )}
                        {selectedCategory === 'animation' && (
                          <span className="text-3xl">
                            {item.name.match(/(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u)?.[0] ||
                             item.name.slice(0, 2).trim() || '✨'}
                          </span>
                        )}
                        {selectedCategory === 'border' && (
                          <div
                            className={`w-10 h-10 mx-auto rounded-lg border-4 ${
                              displayValue === 'none'
                                ? 'border-transparent bg-gray-100'
                                : displayValue === 'solid'
                                ? 'border-gray-400 bg-gray-100'
                                : displayValue.startsWith('gradient')
                                ? 'border-0 bg-gradient-to-r from-purple-500 via-pink-500 to-red-500'
                                : displayValue.startsWith('neon')
                                ? `border-4 ${
                                    displayValue === 'neon-blue'
                                      ? 'border-blue-400 shadow-lg shadow-blue-400/50'
                                      : displayValue === 'neon-pink'
                                      ? 'border-pink-400 shadow-lg shadow-pink-400/50'
                                      : 'border-green-400 shadow-lg shadow-green-400/50'
                                  } bg-gray-100`
                                : 'border-purple-400 bg-gray-100'
                            }`}
                          />
                        )}
                        {selectedCategory === 'nameEffect' && (
                          <span
                            className={`text-sm font-bold ${
                              displayValue === 'none'
                                ? ''
                                : displayValue.includes('rainbow')
                                ? 'bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 bg-clip-text text-transparent'
                                : displayValue.includes('fire')
                                ? 'bg-gradient-to-r from-red-600 to-orange-500 bg-clip-text text-transparent'
                                : displayValue.includes('gold')
                                ? 'text-yellow-500 drop-shadow-lg'
                                : displayValue.includes('glow')
                                ? 'text-blue-500 drop-shadow-lg'
                                : ''
                            }`}
                          >
                            홍길동
                          </span>
                        )}
                        {selectedCategory === 'background' && (
                          <div
                            className={`w-10 h-10 mx-auto rounded-lg ${
                              displayValue === 'none'
                                ? 'bg-white border'
                                : displayValue === 'dots'
                                ? 'bg-[radial-gradient(circle,_#ddd_1px,_transparent_1px)] bg-[length:8px_8px]'
                                : displayValue === 'stars'
                                ? 'bg-gradient-to-br from-indigo-100 to-purple-100'
                                : displayValue === 'hearts'
                                ? 'bg-gradient-to-br from-pink-100 to-red-100'
                                : 'bg-gradient-to-br from-gray-100 to-gray-200'
                            }`}
                          />
                        )}
                        {selectedCategory === 'titleColor' && (
                          <Badge
                            className={`${
                              ['0', '1', '2', '3', '4'].includes(displayValue)
                                ? [
                                    'bg-red-100 text-red-800',
                                    'bg-orange-100 text-orange-800',
                                    'bg-yellow-100 text-yellow-800',
                                    'bg-green-100 text-green-800',
                                    'bg-blue-100 text-blue-800',
                                  ][parseInt(displayValue)]
                                : displayValue === '5'
                                ? 'bg-purple-100 text-purple-800'
                                : displayValue === '8'
                                ? 'bg-yellow-200 text-yellow-900'
                                : displayValue === '9'
                                ? 'bg-gradient-to-r from-red-400 via-yellow-400 to-blue-400 text-white'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            칭호
                          </Badge>
                        )}
                        {selectedCategory === 'buttonBorder' && (
                          <div
                            className="w-10 h-10 mx-auto rounded-lg border-4 bg-white"
                            style={{
                              borderColor: displayValue === 'gradient'
                                ? undefined
                                : displayValue.includes('red') ? '#f87171'
                                : displayValue.includes('orange') ? '#fb923c'
                                : displayValue.includes('yellow') ? '#facc15'
                                : displayValue.includes('green') ? '#4ade80'
                                : displayValue.includes('blue') ? '#60a5fa'
                                : displayValue.includes('purple') ? '#a855f7'
                                : displayValue.includes('pink') ? '#f472b6'
                                : '#d1d5db',
                              background: displayValue === 'gradient'
                                ? 'linear-gradient(45deg, #8b5cf6, #ec4899, #ef4444)'
                                : undefined
                            }}
                          />
                        )}
                        {selectedCategory === 'buttonFill' && (
                          <div
                            className={`w-10 h-10 mx-auto rounded-lg border-2 border-gray-300 ${
                              displayValue === 'gradient'
                                ? 'bg-gradient-to-r from-amber-100 via-pink-100 to-purple-100'
                                : displayValue === 'white'
                                ? 'bg-white'
                                : displayValue.includes('red') ? 'bg-red-50'
                                : displayValue.includes('orange') ? 'bg-orange-50'
                                : displayValue.includes('yellow') ? 'bg-yellow-50'
                                : displayValue.includes('green') ? 'bg-green-50'
                                : displayValue.includes('blue') ? 'bg-blue-50'
                                : displayValue.includes('purple') ? 'bg-purple-100'
                                : displayValue.includes('pink') ? 'bg-pink-100'
                                : displayValue.includes('amber') ? 'bg-amber-100'
                                : 'bg-gray-50'
                            }`}
                          />
                        )}
                      </div>

                      {/* 아이템 이름 (하단) */}
                      <p className="text-center font-medium text-xs mb-1 truncate">{item.name}</p>

                      {/* 가격 / 구매 버튼 */}
                      {owned ? (
                        <div className="text-center text-xs text-green-600">
                          보유
                        </div>
                      ) : item.price === 0 ? (
                        <div className="text-center text-xs text-gray-500">무료</div>
                      ) : (
                        <button
                          className={`w-full text-xs py-1 px-1 rounded font-medium flex items-center justify-center gap-0.5 ${
                            canBuy
                              ? 'bg-purple-600 text-white hover:bg-purple-700'
                              : 'bg-gray-200 text-gray-500'
                          }`}
                          disabled={!canBuy || purchasing === item.code}
                          onClick={() => handlePurchase(item.code)}
                        >
                          {purchasing === item.code ? (
                            '...'
                          ) : canBuy ? (
                            <>
                              <Candy className="w-3 h-3" />
                              {item.price}
                            </>
                          ) : (
                            <>
                              <Lock className="w-3 h-3" />
                              {item.price}
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 안내 */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4">
            <p className="text-sm text-blue-800">
              <strong>안내:</strong> 구매한 아이템은 마이페이지에서 프로필에 적용할 수 있습니다.
              캔디는 다했니에서 쿠키가 증가할 때마다 자동으로 적립됩니다.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
