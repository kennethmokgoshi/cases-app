$file = "app\b2b-dashboard\page.tsx"
$content = Get-Content $file -Raw

# Find the position to insert (before closing </div> of stats grid)
$insertPoint = '                </div>
            </div>

            {/* Action Cards */}'

$newCard = '                </div>

                {/* My Cases */}
                <div className="bg-zeno-gray border border-zeno-cyan/30 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-400">My Cases</h3>
                        <div className="w-12 h-12 bg-zeno-cyan/10 rounded-lg flex items-center justify-center">
                            <svg className="w-6 h-6 text-zeno-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        </div>
                    </div>
                    <p className="text-4xl font-bold text-white">{stats.myCases}</p>
                    <p className="text-xs text-gray-500 mt-2">Cases you uploaded</p>
                </div>
            </div>

            {/* Action Cards */}'

$content = $content -replace [regex]::Escape($insertPoint), $newCard
Set-Content $file -Value $content -NoNewline

Write-Host "My Cases card added successfully!"
