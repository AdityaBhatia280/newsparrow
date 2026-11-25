import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Atom, Award, BookOpen, Bookmark, BookmarkCheck, Brain, Briefcase,
  Calendar, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Circle, CircleAlert, CircleCheck, Clock, Code, Compass, Copy, Cpu,
  Download, ExternalLink, FileText, FlaskConical, Gift, Globe, GraduationCap, GripVertical, HeartHandshake, History, House, Info,
  KeyRound, Kanban, Landmark, LayoutGrid, Leaf, Lightbulb, Link, List, ListChecks, LoaderCircle, Lock, LogOut, Mail, MapPin, Medal,
  MessageSquare, Music, Palette, PartyPopper, PenTool, Pencil, Plus, Printer, RefreshCw, Rocket, Search, Send, Settings, Shield,
  SlidersHorizontal, Sparkles, Star, Stethoscope, Target, Telescope, Trash2, TriangleAlert, Trophy, Upload, User, Users, Wallet, WandSparkles, X,
} from "lucide-preact";

const ICONS = {
  "arrow-down": ArrowDown, "arrow-left": ArrowLeft, "arrow-right": ArrowRight, "arrow-up": ArrowUp, "arrow-up-right": ArrowUpRight,
  atom: Atom, award: Award, "book-open": BookOpen, bookmark: Bookmark, "bookmark-check": BookmarkCheck, brain: Brain, briefcase: Briefcase,
  calendar: Calendar, "calendar-days": CalendarDays, check: Check, "chevron-down": ChevronDown, "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight, circle: Circle, alert: CircleAlert, "circle-check": CircleCheck, clock: Clock, code: Code, compass: Compass,
  copy: Copy, cpu: Cpu, download: Download, external: ExternalLink, "file-text": FileText, "flask-conical": FlaskConical, gift: Gift,
  globe: Globe, "graduation-cap": GraduationCap, grip: GripVertical, "heart-handshake": HeartHandshake, history: History, house: House,
  info: Info, key: KeyRound, kanban: Kanban, landmark: Landmark, grid: LayoutGrid, leaf: Leaf, lightbulb: Lightbulb, link: Link, list: List,
  "list-checks": ListChecks, loader: LoaderCircle, lock: Lock, "log-out": LogOut, mail: Mail, "map-pin": MapPin, medal: Medal,
  message: MessageSquare, music: Music, palette: Palette, party: PartyPopper, "pen-tool": PenTool, pencil: Pencil, plus: Plus,
  printer: Printer, refresh: RefreshCw, rocket: Rocket, search: Search, send: Send, settings: Settings, shield: Shield,
  sliders: SlidersHorizontal, sparkles: Sparkles, star: Star, stethoscope: Stethoscope, target: Target, telescope: Telescope,
  trash: Trash2, warning: TriangleAlert, trophy: Trophy, upload: Upload, user: User, users: Users, wallet: Wallet, wand: WandSparkles, x: X,
};

export function Icon({ name, size, ...props }) {
  const Component = ICONS[name] || Sparkles;
  return <Component aria-hidden="true" focusable="false" strokeWidth={1.85} {...(size ? { width: size, height: size } : {})} {...props} />;
}

/** Sparrow's mark: an abstract bird in flight, in the blue gradient. */
export function Mark({ class: cls = "brand__mark" }) {
  return (
    <svg class={cls} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="mark-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#1f6bff" />
          <stop offset="0.6" stop-color="#2b7fff" />
          <stop offset="1" stop-color="#8fe1ff" />
        </linearGradient>
        <linearGradient id="mark-wing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffffff" />
          <stop offset="1" stop-color="#d9f0ff" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#mark-bg)" />
      <path d="M10 22 31 31 52 13 41 37 24 48 28 35Z" fill="url(#mark-wing)" />
      <path d="M31 31 41 37 52 13Z" fill="#ffffff" opacity="0.55" />
    </svg>
  );
}

/** Google's multicolor "G" for the sign-in button (brand guidelines allow it on a light button). */
export function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
