import {
  BadgeCheck,
  ChevronDown,
  Coins,
  CreditCard,
  LogOut,
  Mail,
  Phone,
  Sparkles,
  User
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { UserProfile } from "../auth/userProfile";

interface TopBarProps {
  userProfile: UserProfile;
  onBrandClick: () => void;
  onLogout: () => void;
  onRechargeCredits: (amount: number) => void;
}

const rechargeOptions = [100, 500, 1200];

function formatDateTime(dateTime: string) {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(dateTime));
  } catch {
    return "刚刚";
  }
}

export function TopBar({
  userProfile,
  onBrandClick,
  onLogout,
  onRechargeCredits
}: TopBarProps) {
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isProfileDetailsOpen, setIsProfileDetailsOpen] = useState(false);
  const [lastRechargeAmount, setLastRechargeAmount] = useState<number | null>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAccountOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(event.target as Node)
      ) {
        setIsAccountOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsAccountOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAccountOpen]);

  useEffect(() => {
    if (!lastRechargeAmount) {
      return;
    }

    const timer = window.setTimeout(() => setLastRechargeAmount(null), 1800);
    return () => window.clearTimeout(timer);
  }, [lastRechargeAmount]);

  function handleRecharge(amount: number) {
    onRechargeCredits(amount);
    setLastRechargeAmount(amount);
  }

  return (
    <header className="topbar">
      <button
        className="brand-block"
        type="button"
        onClick={onBrandClick}
        aria-label="返回欢迎页面"
      >
        <div className="brand-mark" aria-hidden="true">
          <Sparkles size={18} />
        </div>
        <span className="brand-name">Zerlum</span>
      </button>

      <div className="top-actions">
        <div className="account-menu-wrap" ref={accountMenuRef}>
          <button
            aria-expanded={isAccountOpen}
            aria-haspopup="menu"
            className="account-trigger"
            type="button"
            onClick={() => setIsAccountOpen((current) => !current)}
          >
            <span className="account-avatar" aria-hidden="true">
              {userProfile.avatarInitial}
            </span>
            <span className="account-trigger-copy">
              <strong>{userProfile.username}</strong>
              <span>{userProfile.credits} 积分</span>
            </span>
            <ChevronDown
              className={isAccountOpen ? "is-open" : undefined}
              size={15}
              aria-hidden="true"
            />
          </button>

          {isAccountOpen ? (
            <div
              className="account-menu"
              role="menu"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="account-profile">
                <span className="account-profile-avatar" aria-hidden="true">
                  {userProfile.avatarInitial}
                </span>
                <div className="account-profile-main">
                  <div className="account-profile-name">
                    <strong>{userProfile.username}</strong>
                    <span>
                      <BadgeCheck size={13} aria-hidden="true" />
                      {userProfile.plan}
                    </span>
                  </div>
                  <div className="account-id">{userProfile.id}</div>
                </div>
              </div>

              <div className="account-info-grid">
                <div className="account-info-row">
                  <Mail size={14} aria-hidden="true" />
                  <span>{userProfile.email || "未绑定邮箱"}</span>
                </div>
                <div className="account-info-row">
                  <Phone size={14} aria-hidden="true" />
                  <span>{userProfile.phone || "未绑定手机号"}</span>
                </div>
              </div>

              <div className="account-credit-panel">
                <div>
                  <span>剩余积分</span>
                  <strong>{userProfile.credits}</strong>
                </div>
                <Coins size={22} aria-hidden="true" />
              </div>

              <div className="account-recharge">
                <div className="account-section-head">
                  <span>充值积分</span>
                  <small>用于生成、高清导出和批量方案</small>
                </div>
                <div className="recharge-options">
                  {rechargeOptions.map((amount) => (
                    <button
                      className="recharge-option"
                      key={amount}
                      type="button"
                      onClick={() => handleRecharge(amount)}
                    >
                      <strong>+{amount}</strong>
                      <span>{amount >= 1000 ? "团队包" : "快速充值"}</span>
                    </button>
                  ))}
                </div>
                <button
                  className="account-primary-action"
                  type="button"
                  onClick={() => handleRecharge(500)}
                >
                  <CreditCard size={15} aria-hidden="true" />
                  充值 500 积分
                </button>
                <div className="account-feedback" aria-live="polite">
                  {lastRechargeAmount
                    ? `已增加 ${lastRechargeAmount} 积分`
                    : userProfile.rechargeRecords[0]
                      ? `最近充值 ${userProfile.rechargeRecords[0].amount} 积分，${formatDateTime(
                          userProfile.rechargeRecords[0].createdAt
                        )}`
                      : "当前为本地积分记录，后续可接支付接口"}
                </div>
              </div>

              <div className="account-menu-actions">
                <button
                  aria-expanded={isProfileDetailsOpen}
                  className="account-menu-row"
                  type="button"
                  onClick={() => setIsProfileDetailsOpen((current) => !current)}
                >
                  <User size={15} aria-hidden="true" />
                  <span>{isProfileDetailsOpen ? "收起资料" : "完整资料"}</span>
                </button>
                {isProfileDetailsOpen ? (
                  <div className="account-detail-box">
                    <div>
                      <span>注册时间</span>
                      <strong>{formatDateTime(userProfile.createdAt)}</strong>
                    </div>
                    <div>
                      <span>最近登录</span>
                      <strong>{formatDateTime(userProfile.lastLoginAt)}</strong>
                    </div>
                    <div>
                      <span>累计充值</span>
                      <strong>{userProfile.totalRecharged} 积分</strong>
                    </div>
                  </div>
                ) : null}
                <button
                  className="account-menu-row danger"
                  type="button"
                  onClick={onLogout}
                >
                  <LogOut size={15} aria-hidden="true" />
                  <span>退出登录</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
