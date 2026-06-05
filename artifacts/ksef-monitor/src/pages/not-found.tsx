import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md mx-4 text-center">
        <p className="text-7xl font-bold text-gray-200 mb-6">404</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Nie znaleziono strony</h1>
        <p className="text-gray-500 mb-8">
          Strona, której szukasz, nie istnieje lub została przeniesiona.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md bg-teal-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-700 transition-colors"
          >
            Wróć na stronę główną
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Zaloguj się
          </Link>
        </div>
      </div>
    </div>
  );
}
