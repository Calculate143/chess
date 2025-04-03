var g_startOffset = null;
var g_selectedPiece = null;
var moveNumber = 1;
var g_allMoves = [];
var g_playerWhite = true;
var g_changingFen = false;
var g_analyzing = false;
var g_uiBoard;
var g_cellSize = 50;
var g_lastMoveFrom = -1;
var g_lastMoveTo = -1;
var g_selectedSquare = -1;
var g_possibleMoves = [];

function UINewGame() {
    moveNumber = 1;
    var pgnTextBox = document.getElementById("PgnTextBox");
    pgnTextBox.value = "";

    EnsureAnalysisStopped();
    ResetGame();
    if (InitializeBackgroundEngine()) {
        g_backgroundEngine.postMessage("go");
    }
    
    g_allMoves = [];
    g_lastMoveFrom = -1;
    g_lastMoveTo = -1;
    g_selectedSquare = -1;
    g_possibleMoves = [];
    
    RedrawBoard();

    if (!g_playerWhite) {
        SearchAndRedraw();
    }
}

function EnsureAnalysisStopped() {
    if (g_analyzing && g_backgroundEngine != null) {
        g_backgroundEngine.terminate();
        g_backgroundEngine = null;
    }
}

function UIAnalyzeToggle() {
    if (InitializeBackgroundEngine()) {
        if (!g_analyzing) {
            g_backgroundEngine.postMessage("analyze");
        } else {
            EnsureAnalysisStopped();
        }
        g_analyzing = !g_analyzing;
        document.getElementById("AnalysisToggleLink").innerText = g_analyzing ? "Analysis: On" : "Analysis: Off";
    } else {
        alert("Your browser must support web workers for analysis");
    }
}

function UIChangeFEN() {
    if (!g_changingFen) {
        var fenTextBox = document.getElementById("FenTextBox");
        var result = InitializeFromFen(fenTextBox.value);
        if (result.length != 0) {
            UpdatePVDisplay(result);
            return;
        } else {
            UpdatePVDisplay('');
        }
        g_allMoves = [];

        EnsureAnalysisStopped();
        InitializeBackgroundEngine();

        g_playerWhite = !!g_toMove;
        g_backgroundEngine.postMessage("position " + GetFen());

        g_lastMoveFrom = -1;
        g_lastMoveTo = -1;
        g_selectedSquare = -1;
        g_possibleMoves = [];
        
        RedrawBoard();
    }
}

function UIChangeStartPlayer() {
    g_playerWhite = !g_playerWhite;
    g_lastMoveFrom = -1;
    g_lastMoveTo = -1;
    g_selectedSquare = -1;
    g_possibleMoves = [];
    RedrawBoard();
}

function UpdatePgnTextBox(move) {
    var pgnTextBox = document.getElementById("PgnTextBox");
    if (g_toMove != 0) {
        pgnTextBox.value += moveNumber + ". ";
        moveNumber++;
    }
    pgnTextBox.value += GetMoveSAN(move) + " ";
}

function UIChangeTimePerMove() {
    var timePerMove = document.getElementById("TimePerMove");
    g_timeout = parseInt(timePerMove.value, 10);
}

function FinishMove(bestMove, value, timeTaken, ply) {
    if (bestMove != null) {
        UIPlayMove(bestMove, BuildPVMessage(bestMove, value, timeTaken, ply));
    } else {
        alert("Checkmate!");
    }
}

function UIPlayMove(move, pv) {
    g_lastMoveFrom = move & 0xFF;
    g_lastMoveTo = (move >> 8) & 0xFF;
    
    // Convert to UI coordinates
    var fromX = (g_lastMoveFrom & 0xF) - 4;
    var fromY = ((g_lastMoveFrom >> 4) & 0xF) - 2;
    var toX = (g_lastMoveTo & 0xF) - 4;
    var toY = ((g_lastMoveTo >> 4) & 0xF) - 2;
    
    if (!g_playerWhite) {
        fromY = 7 - fromY;
        toY = 7 - toY;
        fromX = 7 - fromX;
        toX = 7 - toX;
    }
    
    g_lastMoveFrom = fromY * 8 + fromX;
    g_lastMoveTo = toY * 8 + toX;
    
    UpdatePgnTextBox(move);
    g_allMoves[g_allMoves.length] = move;
    MakeMove(move);
    UpdatePVDisplay(pv);
    UpdateFromMove(move);
    
    var fen = GetFen();
    document.getElementById("FenTextBox").value = fen;
    
    // Check for game end
    var validMoves = GenerateValidMoves();
    if (validMoves.length == 0) {
        if (g_inCheck) {
            UpdatePVDisplay("Checkmate! " + (g_toMove == colorWhite ? "Black wins" : "White wins"));
        } else {
            UpdatePVDisplay("Stalemate!");
        }
    } else if (g_inCheck) {
        UpdatePVDisplay("Check!");
    }
    
    setTimeout("SearchAndRedraw()", 0);
}

function UIUndoMove() {
    if (g_allMoves.length == 0) {
        return;
    }

    if (g_backgroundEngine != null) {
        g_backgroundEngine.terminate();
        g_backgroundEngine = null;
    }

    UnmakeMove(g_allMoves[g_allMoves.length - 1]);
    g_allMoves.pop();

    if (g_playerWhite != !!g_toMove && g_allMoves.length != 0) {
        UnmakeMove(g_allMoves[g_allMoves.length - 1]);
        g_allMoves.pop();
    }

    g_lastMoveFrom = -1;
    g_lastMoveTo = -1;
    g_selectedSquare = -1;
    g_possibleMoves = [];
    RedrawBoard();
}

function UpdatePVDisplay(pv) {
    if (pv != null) {
        var outputDiv = document.getElementById("output");
        if (outputDiv.firstChild != null) {
            outputDiv.removeChild(outputDiv.firstChild);
        }
        outputDiv.appendChild(document.createTextNode(pv));
    }
}

function SearchAndRedraw() {
    if (g_analyzing) {
        EnsureAnalysisStopped();
        InitializeBackgroundEngine();
        g_backgroundEngine.postMessage("position " + GetFen());
        g_backgroundEngine.postMessage("analyze");
        return;
    }

    if (InitializeBackgroundEngine()) {
        g_backgroundEngine.postMessage("search " + g_timeout);
    } else {
        Search(FinishMove, 99, null);
    }
}

var g_backgroundEngineValid = true;
var g_backgroundEngine;

function InitializeBackgroundEngine() {
    if (!g_backgroundEngineValid) {
        return false;
    }

    if (g_backgroundEngine == null) {
        g_backgroundEngineValid = true;
        try {
            g_backgroundEngine = new Worker("js/garbochess.js");
            g_backgroundEngine.onmessage = function (e) {
                if (e.data.match("^pv") == "pv") {
                    UpdatePVDisplay(e.data.substr(3, e.data.length - 3));
                } else if (e.data.match("^message") == "message") {
                    EnsureAnalysisStopped();
                    UpdatePVDisplay(e.data.substr(8, e.data.length - 8));
                } else {
                    UIPlayMove(GetMoveFromString(e.data), null);
                }
            }
            g_backgroundEngine.error = function (e) {
                alert("Error from background worker:" + e.message);
            }
            g_backgroundEngine.postMessage("position " + GetFen());
        } catch (error) {
            g_backgroundEngineValid = false;
        }
    }

    return g_backgroundEngineValid;
}

function UpdateFromMove(move) {
    var fromX = (move & 0xF) - 4;
    var fromY = ((move >> 4) & 0xF) - 2;
    var toX = ((move >> 8) & 0xF) - 4;
    var toY = ((move >> 12) & 0xF) - 2;

    if (!g_playerWhite) {
        fromY = 7 - fromY;
        toY = 7 - toY;
        fromX = 7 - fromX;
        toX = 7 - toX;
    }

    if ((move & moveflagCastleKing) ||
        (move & moveflagCastleQueen) ||
        (move & moveflagEPC) ||
        (move & moveflagPromotion)) {
        RedrawPieces();
    } else {
        var fromSquare = g_uiBoard[fromY * 8 + fromX];
        $(g_uiBoard[toY * 8 + toX])
            .empty()
            .append($(fromSquare).children());
    }
}

function RedrawBoard() {
    var div = $("#board")[0];
    $(div).empty();

    var table = document.createElement("table");
    table.cellPadding = "0px";
    table.cellSpacing = "0px";
    $(table).addClass('no-highlight');

    var tbody = document.createElement("tbody");
    g_uiBoard = [];

    for (var y = 0; y < 8; ++y) {
        var tr = document.createElement("tr");

        for (var x = 0; x < 8; ++x) {
            var td = document.createElement("td");
            td.className = ((y ^ x) & 1) ? "dark" : "light";
            
            // Highlight last move
            if ((y * 8 + x) == g_lastMoveFrom || (y * 8 + x) == g_lastMoveTo) {
                td.className += " last-move";
            }
            
            // Highlight selected square
            if (g_selectedSquare == (y * 8 + x)) {
                td.className += " highlight";
            }
            
            // Highlight possible moves
            if (g_possibleMoves.some(move => {
                var toY = ((move >> 12) & 0xF) - 2;
                var toX = ((move >> 8) & 0xF) - 4;
                if (!g_playerWhite) {
                    toY = 7 - toY;
                    toX = 7 - toX;
                }
                return toY == y && toX == x;
            })) {
                td.className += " highlight";
            }

            td.style.width = g_cellSize + "px";
            td.style.height = g_cellSize + "px";
            
            // Add coordinates for chess notation
            if (g_playerWhite) {
                if (y === 7) {
                    var coord = document.createElement("div");
                    coord.className = "coordinate";
                    coord.style.textAlign = "right";
                    coord.style.fontSize = "10px";
                    coord.style.paddingRight = "2px";
                    coord.textContent = String.fromCharCode(97 + x);
                    td.appendChild(coord);
                }
                if (x === 0) {
                    var coord = document.createElement("div");
                    coord.className = "coordinate";
                    coord.style.textAlign = "left";
                    coord.style.fontSize = "10px";
                    coord.style.paddingLeft = "2px";
                    coord.textContent = (8 - y).toString();
                    td.appendChild(coord);
                }
            } else {
                if (y === 0) {
                    var coord = document.createElement("div");
                    coord.className = "coordinate";
                    coord.style.textAlign = "right";
                    coord.style.fontSize = "10px";
                    coord.style.paddingRight = "2px";
                    coord.textContent = String.fromCharCode(97 + (7 - x));
                    td.appendChild(coord);
                }
                if (x === 7) {
                    var coord = document.createElement("div");
                    coord.className = "coordinate";
                    coord.style.textAlign = "left";
                    coord.style.fontSize = "10px";
                    coord.style.paddingLeft = "2px";
                    coord.textContent = (y + 1).toString();
                    td.appendChild(coord);
                }
            }

            tr.appendChild(td);
            g_uiBoard[y * 8 + x] = td;
        }

        tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    div.appendChild(table);

    RedrawPieces();

    g_changingFen = true;
    document.getElementById("FenTextBox").value = GetFen();
    g_changingFen = false;
}

function RedrawPieces() {
    for (var y = 0; y < 8; ++y) {
        for (var x = 0; x < 8; ++x) {
            var td = g_uiBoard[y * 8 + x];
            var pieceY = g_playerWhite ? y : 7 - y;
            var piece = g_board[((pieceY + 2) * 0x10) + (g_playerWhite ? x : 7 - x) + 4];
            
            $(td).empty();
            
            if (piece != 0) {
                var pieceName = GetPieceClass(piece);
                if (pieceName) {
                    var div = document.createElement("div");
                    div.className = "piece " + pieceName;
                    div.dataset.square = y * 8 + x;
                    
                    // Highlight king in check
                    if ((piece & 0x7) == pieceKing && g_inCheck && 
                        ((piece & colorWhite) ? g_toMove == colorWhite : g_toMove == 0)) {
                        td.className += " check";
                    }
                    
                    $(div).draggable({
                        start: function(e, ui) {
                            $(this).addClass('dragging');
                            var square = parseInt($(this).data('square'));
                            HandleSquareSelect(square);
                        },
                        stop: function() {
                            $(this).removeClass('dragging');
                        },
                        containment: "#board",
                        cursor: "grabbing",
                        zIndex: 100
                    });
                    
                    $(div).click(function() {
                        var square = parseInt($(this).data('square'));
                        HandleSquareSelect(square);
                    });
                    
                    td.appendChild(div);
                }
            }
        }
    }
}

function GetPieceClass(piece) {
    var color = (piece & colorWhite) ? "white" : "black";
    switch (piece & 0x7) {
        case piecePawn: return "pawn-" + color;
        case pieceKnight: return "knight-" + color;
        case pieceBishop: return "bishop-" + color;
        case pieceRook: return "rook-" + color;
        case pieceQueen: return "queen-" + color;
        case pieceKing: return "king-" + color;
    }
    return null;
}

function HandleSquareSelect(square) {
    var y = Math.floor(square / 8);
    var x = square % 8;
    var pieceY = g_playerWhite ? y : 7 - y;
    var pieceX = g_playerWhite ? x : 7 - x;
    var boardSquare = ((pieceY + 2) * 0x10) + pieceX + 4;
    var piece = g_board[boardSquare];
    
    // If it's the opponent's piece or empty, try to make a move if we have a selected piece
    if (g_selectedSquare != -1 && 
        ((piece == 0) || ((piece & colorWhite) ? g_toMove == 0 : g_toMove == colorWhite))) {
        var fromY = Math.floor(g_selectedSquare / 8);
        var fromX = g_selectedSquare % 8;
        var fromPieceY = g_playerWhite ? fromY : 7 - fromY;
        var fromPieceX = g_playerWhite ? fromX : 7 - fromX;
        var fromBoardSquare = ((fromPieceY + 2) * 0x10) + fromPieceX + 4;
        
        var moves = GenerateValidMoves();
        var move = null;
        for (var i = 0; i < moves.length; i++) {
            if ((moves[i] & 0xFF) == fromBoardSquare &&
                ((moves[i] >> 8) & 0xFF) == boardSquare) {
                move = moves[i];
                break;
            }
        }
        
        if (move != null) {
            UIPlayMove(move, null);
        }
        
        g_selectedSquare = -1;
        g_possibleMoves = [];
        RedrawBoard();
        return;
    }
    
    // If it's our piece, select it and show possible moves
    if (piece != 0 && ((piece & colorWhite) ? g_toMove == colorWhite : g_toMove == 0)) {
        g_selectedSquare = square;
        g_possibleMoves = GenerateValidMoves().filter(m => (m & 0xFF) == boardSquare);
        RedrawBoard();
    } else {
        g_selectedSquare = -1;
        g_possibleMoves = [];
        RedrawBoard();
    }
}

function dropPiece(e, ui) {
    var table = $("#board table")[0];
    var endX = e.pageX - $(table).offset().left;
    var endY = e.pageY - $(table).offset().top;

    endX = Math.floor(endX / g_cellSize);
    endY = Math.floor(endY / g_cellSize);

    if (endX < 0 || endX > 7 || endY < 0 || endY > 7) {
        // Dropped outside the board
        g_selectedPiece.style.backgroundImage = null;
        g_selectedPiece = null;
        g_selectedSquare = -1;
        g_possibleMoves = [];
        RedrawBoard();
        return;
    }

    var startX = Math.floor(g_startOffset.left / g_cellSize);
    var startY = Math.floor(g_startOffset.top / g_cellSize);

    if (!g_playerWhite) {
        startY = 7 - startY;
        endY = 7 - endY;
        startX = 7 - startX;
        endX = 7 - endX;
    }

    var moves = GenerateValidMoves();
    var move = null;
    for (var i = 0; i < moves.length; i++) {
        if ((moves[i] & 0xFF) == MakeSquare(startY, startX) &&
            ((moves[i] >> 8) & 0xFF) == MakeSquare(endY, endX)) {
            move = moves[i];
        }
    }

    if (!g_playerWhite) {
        startY = 7 - startY;
        endY = 7 - endY;
        startX = 7 - startX;
        endX = 7 - endX;
    }

    g_selectedPiece.style.left = 0;
    g_selectedPiece.style.top = 0;

    if (!(startX == endX && startY == endY) && move != null) {
        UIPlayMove(move, null);
    } else {
        // Invalid move, reset the board
        RedrawBoard();
    }

    g_selectedPiece = null;
    g_selectedSquare = -1;
    g_possibleMoves = [];
}