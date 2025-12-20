document.addEventListener('DOMContentLoaded', function() {
    // Select all anchor elements that are not inside a nav element
    var links = document.querySelectorAll('a:not(nav a)');
    // Loop through each anchor element and set the target attribute to _blank
    links.forEach(function(link) {
        link.setAttribute('target', '_blank');
    });
});