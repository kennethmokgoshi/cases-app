content = open('apps/cases/app/(authenticated)/admin/settings/page.tsx', 'r', encoding='utf-8').read()
print(f'Opens: {content.count("<div")}, Closes: {content.count("</div>")}')
