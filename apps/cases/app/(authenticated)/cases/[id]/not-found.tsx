import Link from 'next/link';

export default function CaseNotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
            <div className="text-2xl font-semibold text-gray-300">Case not found</div>
            <div className="text-gray-400">The case you're looking for does not exist.</div>
            <Link
                href="/cases"
                className="px-6 py-3 bg-zeno-cyan text-zeno-navy font-semibold rounded-lg hover:bg-cyan-400 transition-colors"
            >
                Back to Cases List
            </Link>
        </div>
    );
}
