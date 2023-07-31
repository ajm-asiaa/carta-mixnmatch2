$(document).ready(function(){
    $('#go-button').on('click', function(e) {
        var frontendValue = document.querySelector('input[name = "frontend-commits"]:checked').value;
        var backendValue = document.querySelector('input[name = "backend-commits"]:checked').value;
    });
});

