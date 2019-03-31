
function updateUI(report) {
    document.querySelector('#statementDate').textContent = report.statementDate;
}

function download(filename, text) {
    var pom = document.createElement('a');
    pom.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    pom.setAttribute('download', filename);

    if (document.createEvent) {
        var event = document.createEvent('MouseEvents');
        event.initEvent('click', true, true);
        pom.dispatchEvent(event);
    } else {
        pom.click();
    }
}

function injectedFunction() {
    const el = document.getElementsByClassName('viewStatemetnsOuterWrapper')[0];
    const header = document.getElementsByClassName('confirmationDetails')[0];

    const report = {
        transactions: []
    };

    const accInfo = header && header.textContent.match(/(\d\d-\d\d-\d\d) (\d{8})/);
    const statementDate = header && header.textContent.match(/Statement date[ \n\t]*(\d\d \w{3} \d\d)/);

    if (statementDate && statementDate.length === 2) {
        report.statementDate = statementDate[1];
    }


    if (accInfo && accInfo.length === 3) {
        report.sortCode = accInfo[1];
        report.accNo = accInfo[2];
    }

    const rows = el.getElementsByClassName('gridxRow');
    const length = rows.length;


    [].forEach.call(rows, (row, idx) => {
        const cells = [...row.getElementsByClassName('gridxCell')];

        const data = cells.reduce((prev, c) => {

            const field = (c.getAttribute('colid') || '').replace('col', '').toLowerCase();

            if (field) {
                const clone = c.cloneNode(true);
                const fieldData = [];
                [...clone.children].forEach(innerChild => {
                    if (!innerChild.classList || !innerChild.classList.contains('accessible')) {
                        fieldData.push(innerChild.innerText);
                    }
                    clone.removeChild(innerChild);
                });
                if (clone.textContent && clone.textContent.length > 0) {
                    fieldData.push(clone.textContent);
                }

                switch (field) {
                    case 'date':
                        prev[field] = fieldData.join('');
                        break;
                    case 'payees':
                        const [payeeName, ...payeeMemo] = fieldData;
                        prev.payeeName = payeeName;
                        prev.payeeMemo = payeeMemo.length > 0 ? payeeMemo.join('\n') : null;
                        break;
                    default:
                        prev[field] = Number(fieldData.join('').replace(/,/g, ''));
                }

            }

            return prev;
        }, {});


        if (idx === 0 && data.amount === 0) {
            report.openDate = data.date;
            report.openBalance = data.balance;
        } else if (idx === length - 1 && data.amount === 0) {
            report.closeDate = data.date;
            report.closeBalance = data.balance;
        } else {
            report.transactions.push(data);
        }
    });

    chrome.runtime.sendMessage(report);
}

function fetchReport() {
    chrome.tabs.query({ active: true }, function (tabs) {
        chrome.tabs.executeScript(tabs[0].id, {
            code: injectedFunction.toString() + '; injectedFunction();'
        });
    });
}

fetchReport();

function dateStrToYYYYMMDD(dt) {
    const months = {
        'Jan': '01',
        'Feb': '02',
        'Mar': '03',
        'Apr': '04',
        'May': '05',
        'Jun': '06',
        'Jul': '07',
        'Aug': '08',
        'Sep': '09',
        'Oct': '10',
        'Nov': '11',
        'Dec': '12'
    };

    const [_, dd, m, yy] = dt.match(/(\d\d) (\w{3}) (\d\d)/);
    return `20${yy}${months[m]}${dd}`;
}

chrome.runtime.onMessage.addListener(function (report) {
    const { accNo = 'UNKNOWN', sortCode = 'UNKNOWN', transactions = [] } = report;

    const stmts = transactions.reduce((prev, t) => {
        prev += `<STMTTRN>
<TRNTYPE>OTHER</TRNTYPE>
<DTPOSTED>${dateStrToYYYYMMDD(t.date)}000000</DTPOSTED>
<TRNAMT>${t.amount.toFixed(2)}</TRNAMT>
<FITID>${dateStrToYYYYMMDD(report.statementDate)}${t.index}</FITID>
<NAME>${t.payeeName}</NAME>${t.payeeMemo ? `
<MEMO>${t.payeeMemo}</MEMO>` : ''}
</STMTTRN>`;
        return prev;
    }, '');


    let ofx = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:UTF-8
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0</CODE>
<SEVERITY>INFO</SEVERITY>
</STATUS>
<DTSERVER>${dateStrToYYYYMMDD(report.closeDate)}000000</DTSERVER>
<LANGUAGE>ENG</LANGUAGE>
<INTU.BID>01267</INTU.BID>
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1</TRNUID>
<STATUS>
<CODE>0</CODE>
<SEVERITY>INFO</SEVERITY>
</STATUS>
<STMTRS>
<CURDEF>GBP</CURDEF>
<BANKACCTFROM>
<BANKID>${sortCode.replace(/-/g, '')}</BANKID>
<ACCTID>${sortCode.replace(/-/g, '')}${accNo}</ACCTID>
<ACCTTYPE>CHECKING</ACCTTYPE>
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>${dateStrToYYYYMMDD(report.openDate)}000000</DTSTART>
<DTEND>${dateStrToYYYYMMDD(report.closeDate)}000000</DTEND>
${stmts}
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;
    document.querySelector('#downloadLink').setAttribute('download', 'statement-' + dateStrToYYYYMMDD(report.statementDate) + '.ofx')
    document.querySelector('#downloadLink').href =
        window.URL.createObjectURL(
            new Blob([new TextEncoder().encode(ofx)],
                { type: 'application/x-ofx' }));

    document.querySelector('#downloadFragmentLink').setAttribute('download', 'statement-trans-' + dateStrToYYYYMMDD(report.statementDate) + '.ofx')
    document.querySelector('#downloadFragmentLink').href =
        window.URL.createObjectURL(
            new Blob([new TextEncoder().encode(stmts)],
                { type: 'application/x-ofx' }));
    updateUI(report);
});